import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Tabla de permisos por rol (hardcodeada — no necesita DB)
// Permisos POS: qué puede hacer cada rol en el POS
export type PosPermissions = {
  canOpenTable: boolean      // abrir mesa nueva
  canAddItems: boolean       // agregar items a mesa
  canSendKitchen: boolean    // enviar items a cocina
  canRequestBill: boolean    // pedir cuenta (imprime pre-cuenta)
  canCharge: boolean         // cobrar / procesar pago
  canCloseTable: boolean     // cerrar mesa tras cobro
  canManageCash: boolean     // apertura/cierre de caja, movimientos
  canAccessAdmin: boolean    // acceso al panel admin
  canSeeReports: boolean     // acceso a reportes
}

const ROLE_PERMISSIONS: Record<string, PosPermissions> = {
  dueno: {
    canOpenTable: true,
    canAddItems: true,
    canSendKitchen: true,
    canRequestBill: true,
    canCharge: true,
    canCloseTable: true,
    canManageCash: true,
    canAccessAdmin: true,
    canSeeReports: true,
  },
  gerente: {
    canOpenTable: true,
    canAddItems: true,
    canSendKitchen: true,
    canRequestBill: true,
    canCharge: true,
    canCloseTable: true,
    canManageCash: true,
    canAccessAdmin: false,
    canSeeReports: true,
  },
  cajero: {
    canOpenTable: true,
    canAddItems: true,
    canSendKitchen: true,
    canRequestBill: true,
    canCharge: true,
    canCloseTable: true,
    canManageCash: true,
    canAccessAdmin: false,
    canSeeReports: false,
  },
  mozo: {
    canOpenTable: true,
    canAddItems: true,
    canSendKitchen: true,
    canRequestBill: true,
    canCharge: false,
    canCloseTable: false,
    canManageCash: false,
    canAccessAdmin: false,
    canSeeReports: false,
  },
  cocina: {
    canOpenTable: false,
    canAddItems: false,
    canSendKitchen: false,
    canRequestBill: false,
    canCharge: false,
    canCloseTable: false,
    canManageCash: false,
    canAccessAdmin: false,
    canSeeReports: false,
  },
  // Fallback genérico para roles heredados (ej: 'admin', 'cocinero')
  admin: {
    canOpenTable: true,
    canAddItems: true,
    canSendKitchen: true,
    canRequestBill: true,
    canCharge: true,
    canCloseTable: true,
    canManageCash: true,
    canAccessAdmin: true,
    canSeeReports: true,
  },
  cocinero: {
    canOpenTable: false,
    canAddItems: false,
    canSendKitchen: false,
    canRequestBill: false,
    canCharge: false,
    canCloseTable: false,
    canManageCash: false,
    canAccessAdmin: false,
    canSeeReports: false,
  },
}

const DEFAULT_PERMISSIONS: PosPermissions = {
  canOpenTable: false,
  canAddItems: false,
  canSendKitchen: false,
  canRequestBill: false,
  canCharge: false,
  canCloseTable: false,
  canManageCash: false,
  canAccessAdmin: false,
  canSeeReports: false,
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/pos/auth
// Valida PIN y retorna empleado + permisos según su rol
// body: { pin: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const { pin } = body ?? {}

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }

    const supabase = getAdminClient()

    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, name, role, active')
      .eq('pin', pin)
      .eq('active', true)
      .maybeSingle()

    if (empErr || !employee) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 })
    }

    const role = (employee.role ?? '').toLowerCase().trim()
    const permissions = ROLE_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS

    return NextResponse.json({
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      },
      permissions,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno'
    console.error('[pos/auth]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
