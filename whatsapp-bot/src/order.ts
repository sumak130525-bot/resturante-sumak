import { createClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
}

export interface CartSession {
  cart: CartItem[];
  customerName: string;
  phone: string;
  lastActive: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cartSessions = new Map<string, CartSession>();

// Cleanup stale sessions every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of cartSessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      cartSessions.delete(phone);
    }
  }
}, 5 * 60 * 1000);

// ── Session helpers ────────────────────────────────────────────────────────────

export function getCartSession(phone: string): CartSession | undefined {
  return cartSessions.get(phone);
}

export function upsertCartSession(phone: string, updates: Partial<CartSession>): CartSession {
  const existing = cartSessions.get(phone);
  const session: CartSession = {
    cart: [],
    customerName: '',
    phone,
    ...(existing || {}),
    ...updates,
    lastActive: Date.now(),
  };
  cartSessions.set(phone, session);
  return session;
}

export function clearCartSession(phone: string): void {
  cartSessions.delete(phone);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

export function formatPrice(price: number): string {
  return `$${price.toLocaleString('es-AR')}`;
}

export function formatCart(cart: CartItem[]): string {
  if (cart.length === 0) return '_carrito vacío_';
  return cart.map((item) => `• ${item.quantity}x ${item.name} — ${formatPrice(item.price * item.quantity)}`).join('\n');
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ── Supabase order insertion ───────────────────────────────────────────────────

export async function createSupabaseOrder(
  session: CartSession,
  paymentMethod: 'efectivo' | 'transferencia' | 'mercadopago',
  paymentStatus: 'paid' | 'pending',
): Promise<string> {
  const total = cartTotal(session.cart);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_name: session.customerName,
      customer_phone: session.phone,
      total,
      status: 'pending',
      channel: 'whatsapp',
      dining_option: 'takeaway',
      payment_method: paymentMethod,
      payment_status: paymentStatus,
    })
    .select()
    .single();

  if (orderError || !order) {
    throw new Error(`Error al crear pedido: ${orderError?.message}`);
  }

  const orderItems = session.cart.map((item) => ({
    order_id: order.id,
    menu_item_id: item.id,
    quantity: item.quantity,
    unit_price: Math.round(item.price),
    item_name: item.name,
    line_note: item.note || null,
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

  if (itemsError) {
    // fallback without item_name if column doesn't exist
    const fallback = orderItems.map(({ item_name, ...rest }) => rest);
    const { error: fbErr } = await supabase.from('order_items').insert(fallback);
    if (fbErr) throw new Error(`Error al guardar items: ${fbErr.message}`);
  }

  // Decrement available_qty for limited-stock items (non-fatal)
  try {
    for (const item of session.cart) {
      const { data: stockData } = await supabase
        .from('menu_items')
        .select('available_qty')
        .eq('id', item.id)
        .single();

      if (stockData?.available_qty !== null && stockData?.available_qty !== undefined && stockData.available_qty > 0) {
        await supabase
          .from('menu_items')
          .update({ available_qty: Math.max(0, stockData.available_qty - item.quantity) })
          .eq('id', item.id);
      }
    }
  } catch (stockErr) {
    // Non-fatal: don't fail the order
    void stockErr;
  }

  return order.id as string;
}

// ── Confirmation message ──────────────────────────────────────────────────────

export function buildConfirmationMessage(customerName: string, total: number): string {
  return (
    `✅ *¡Pedido recibido, ${customerName}!*\n\n` +
    `Tu pedido ingresó directamente en cocina. Te avisamos por acá cuando esté listo para retirar. 🍽️\n\n` +
    `💰 *Total: ${formatPrice(total)}*\n\n` +
    `📍 Retirá en: Juan B Alberdi 247, frente a Terminal de Mendoza`
  );
}
