/*
 * ============================================================
 * SQL — ejecutar en Supabase Dashboard → SQL Editor
 * (NO ejecutar desde la app, solo documentación)
 * ============================================================
 *
 * CREATE TABLE IF NOT EXISTS public.employee_payments (
 *   id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 *   type               text NOT NULL CHECK (type IN ('advance', 'salary')),
 *   amount             numeric NOT NULL,
 *   description        text,
 *   period_from        date,
 *   period_to          date,
 *   hours_worked       numeric,
 *   gross_amount       numeric,
 *   advances_deducted  numeric,
 *   cash_movement_id   uuid REFERENCES public.cash_movements(id),
 *   created_at         timestamptz NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE public.employee_payments ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "service_role_all_employee_payments" ON public.employee_payments
 *   FOR ALL TO service_role USING (true) WITH CHECK (true);
 *
 * ============================================================
 * Nuevas columnas para método de pago split (ejecutar una sola vez):
 * ============================================================
 *
 * ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
 * ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS cash_amount numeric DEFAULT 0;
 * ALTER TABLE public.employee_payments ADD COLUMN IF NOT EXISTS transfer_amount numeric DEFAULT 0;
 *
 * ============================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Argentina UTC-3
const ARG_OFFSET_MS = -3 * 60 * 60 * 1000

function nowArgIso(): string {
  return new Date(Date.now() + ARG_OFFSET_MS).toISOString()
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAuth() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list: { name: string; value: string; options: CookieOptions }[]) {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: { user } } = await (authClient as any).auth.getUser()
  return user
}

// GET /api/empleados/pagos?employee_id=...&from=...&to=...&type=advance|salary
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const employee_id = searchParams.get('employee_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const type = searchParams.get('type')

  const sb = getServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb as any)
    .from('employee_payments')
    .select('*, employees(name, role, hourly_rate)')
    .order('created_at', { ascending: false })

  if (employee_id) query = query.eq('employee_id', employee_id)
  if (type) query = query.eq('type', type)
  if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`)
  if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/empleados/pagos
// Body para adelanto: { employee_id, type: 'advance', amount, description,
//                       payment_method?, cash_amount?, transfer_amount? }
// Body para sueldo:   { employee_id, type: 'salary', amount, description?,
//                       period_from, period_to, hours_worked, gross_amount, advances_deducted,
//                       payment_method?, cash_amount?, transfer_amount? }
//
// payment_method: 'cash' (default) | 'transfer' | 'mixed'
//   cash     → crea cash_movement egreso por el total
//   transfer → NO crea cash_movement
//   mixed    → crea cash_movement egreso solo por cash_amount
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    employee_id,
    type,
    amount,
    description,
    period_from,
    period_to,
    hours_worked,
    gross_amount,
    advances_deducted,
    payment_method = 'cash',
    cash_amount,
    transfer_amount,
  } = body

  if (!employee_id) return NextResponse.json({ error: 'employee_id es requerido' }, { status: 400 })
  if (!type || !['advance', 'salary'].includes(type))
    return NextResponse.json({ error: 'type debe ser "advance" o "salary"' }, { status: 400 })
  if (!amount || Number(amount) <= 0)
    return NextResponse.json({ error: 'amount debe ser mayor que 0' }, { status: 400 })

  if (type === 'salary') {
    if (!period_from || !period_to) {
      return NextResponse.json({ error: 'period_from y period_to son requeridos para sueldo' }, { status: 400 })
    }
  }

  const sb = getServiceClient()

  // 1. Find current open cash shift
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openShift } = await (sb as any)
    .from('cash_shifts')
    .select('id')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 2. Register cash movement as egreso — only when payment touches cash
  let cashMovementId: string | null = null

  if (payment_method !== 'transfer') {
    // 'cash': egreso = total amount; 'mixed': egreso = cash_amount only
    const egresoAmount = payment_method === 'mixed'
      ? Number(cash_amount ?? 0)
      : Number(amount)

    const movementDescription =
      type === 'advance'
        ? `Adelanto empleado${description ? ': ' + description : ''}`
        : `Sueldo empleado${period_from ? ` (${period_from} al ${period_to})` : ''}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cashMovement, error: cashErr } = await (sb as any)
      .from('cash_movements')
      .insert({
        type: 'egreso',
        amount: egresoAmount,
        description: movementDescription,
        shift_id: openShift?.id ?? null,
        created_at: nowArgIso(),
      })
      .select('id')
      .single()

    if (cashErr) return NextResponse.json({ error: cashErr.message }, { status: 500 })
    cashMovementId = cashMovement.id
  }

  // 3. Register employee payment record
  const paymentRecord: Record<string, unknown> = {
    employee_id,
    type,
    amount: Number(amount),
    description: description ?? null,
    cash_movement_id: cashMovementId,
    payment_method: payment_method ?? 'cash',
    cash_amount: payment_method === 'mixed'
      ? Number(cash_amount ?? 0)
      : payment_method === 'transfer' ? 0 : Number(amount),
    transfer_amount: payment_method === 'mixed'
      ? Number(transfer_amount ?? 0)
      : payment_method === 'transfer' ? Number(amount) : 0,
    created_at: nowArgIso(),
  }

  if (type === 'salary') {
    paymentRecord.period_from = period_from
    paymentRecord.period_to = period_to
    paymentRecord.hours_worked = hours_worked != null ? Number(hours_worked) : null
    paymentRecord.gross_amount = gross_amount != null ? Number(gross_amount) : null
    paymentRecord.advances_deducted = advances_deducted != null ? Number(advances_deducted) : null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payment, error: payErr } = await (sb as any)
    .from('employee_payments')
    .insert(paymentRecord)
    .select('*, employees(name, role, hourly_rate)')
    .single()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  return NextResponse.json(payment, { status: 201 })
}

// PUT /api/empleados/pagos
// Body: { id: string, amount: number }  — only advance payments can be edited
export async function PUT(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, amount } = body

  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })
  if (!amount || Number(amount) <= 0)
    return NextResponse.json({ error: 'amount debe ser mayor que 0' }, { status: 400 })

  const sb = getServiceClient()

  // Only advance payments can be edited
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (sb as any)
    .from('employee_payments')
    .select('id, type, cash_movement_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing)
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  if (existing.type !== 'advance')
    return NextResponse.json({ error: 'Solo se puede editar el monto de adelantos' }, { status: 400 })

  // Update the payment record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (sb as any)
    .from('employee_payments')
    .update({ amount: Number(amount) })
    .eq('id', id)
    .select('*, employees(name, role, hourly_rate)')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Also update the linked cash_movement amount if it exists
  if (existing.cash_movement_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from('cash_movements')
      .update({ amount: Number(amount) })
      .eq('id', existing.cash_movement_id)
  }

  return NextResponse.json(updated)
}

// DELETE /api/empleados/pagos?id=...
export async function DELETE(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')

  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 })

  const sb = getServiceClient()

  // Fetch the payment to get cash_movement_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: fetchErr } = await (sb as any)
    .from('employee_payments')
    .select('id, cash_movement_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing)
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  // Delete the payment record first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: delErr } = await (sb as any)
    .from('employee_payments')
    .delete()
    .eq('id', id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Delete the linked cash_movement if it exists
  if (existing.cash_movement_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any)
      .from('cash_movements')
      .delete()
      .eq('id', existing.cash_movement_id)
  }

  return NextResponse.json({ ok: true })
}
