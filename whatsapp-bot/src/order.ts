import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { getMenu } from './menu';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrderState =
  | 'idle'
  | 'browsing_categories'
  | 'browsing_items'
  | 'cart'
  | 'awaiting_name'
  | 'awaiting_payment_choice'
  | 'awaiting_payment'
  | 'confirmed';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderSession {
  state: OrderState;
  cart: CartItem[];
  customerName: string;
  phone: string;
  currentCategoryIndex?: number; // index into categories array for browsing_items
  lastActive: number;
  pendingOrderId?: string; // after insert, before payment confirmed
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORDER_SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes
const orderSessions = new Map<string, OrderSession>();

// Cleanup stale order sessions every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of orderSessions.entries()) {
    if (now - session.lastActive > ORDER_SESSION_TTL_MS) {
      orderSessions.delete(phone);
    }
  }
}, 5 * 60 * 1000);

// ── Session helpers ────────────────────────────────────────────────────────────

export function getOrderSession(phone: string): OrderSession | undefined {
  return orderSessions.get(phone);
}

export function hasActiveOrderSession(phone: string): boolean {
  const s = orderSessions.get(phone);
  return !!s && s.state !== 'idle';
}

function upsertSession(phone: string, updates: Partial<OrderSession>): OrderSession {
  const existing = orderSessions.get(phone);
  const session: OrderSession = {
    state: 'idle',
    cart: [],
    customerName: '',
    phone,
    ...(existing || {}),
    ...updates,
    lastActive: Date.now(),
  };
  orderSessions.set(phone, session);
  return session;
}

export function clearOrderSession(phone: string): void {
  orderSessions.delete(phone);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return `$${price.toLocaleString('es-AR')}`;
}

function formatCart(cart: CartItem[]): string {
  if (cart.length === 0) return '_carrito vacío_';
  return cart.map((item) => `• ${item.quantity}x ${item.name} — ${formatPrice(item.price * item.quantity)}`).join('\n');
}

function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ── Supabase order insertion ───────────────────────────────────────────────────

export async function createSupabaseOrder(
  session: OrderSession,
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
  }));

  const { error: itemsError } = await supabase.from('order_items').insert(orderItems);

  if (itemsError) {
    // fallback without item_name if column doesn't exist
    const fallback = orderItems.map(({ item_name, ...rest }) => rest);
    const { error: fbErr } = await supabase.from('order_items').insert(fallback);
    if (fbErr) throw new Error(`Error al guardar items: ${fbErr.message}`);
  }

  return order.id as string;
}

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * Main entry point. Returns the bot reply for this message.
 * Only called when the phone has an active order session OR when text triggers 'pedir'.
 */
export async function handleOrderMessage(text: string, phone: string): Promise<string> {
  const t = text.trim();
  const tNorm = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // ── Cancel anywhere ──────────────────────────────────────────────────────────
  if (t === '0' || tNorm === 'cancelar' || tNorm === 'salir') {
    clearOrderSession(phone);
    return '❌ Pedido cancelado. Si querés hacer uno nuevo, escribí *pedir* 🌿';
  }

  const session = orderSessions.get(phone);
  const state = session?.state ?? 'idle';

  // ── Trigger ──────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return await handleBrowsingCategories(phone);
  }

  // ── Route by state ────────────────────────────────────────────────────────────
  switch (state) {
    case 'browsing_categories':
      return await handleCategoryChoice(t, phone);
    case 'browsing_items':
      return await handleItemChoice(t, phone);
    case 'cart':
      return await handleCartChoice(t, phone);
    case 'awaiting_name':
      return await handleNameInput(t, phone);
    case 'awaiting_payment_choice':
      return await handlePaymentChoice(t, phone);
    case 'awaiting_payment':
      return handleAwaitingPayment(t, phone);
    default:
      clearOrderSession(phone);
      return '❌ Algo salió mal. Escribí *pedir* para comenzar de nuevo.';
  }
}

// ── Step: Show categories ─────────────────────────────────────────────────────

async function handleBrowsingCategories(phone: string): Promise<string> {
  const { categories, items } = await getMenu();

  // Only show categories that have at least one available item
  const visibleCategories = categories.filter((cat) =>
    items.some((item) => item.category_id === cat.id),
  );

  if (visibleCategories.length === 0) {
    return 'Lo sentimos, el menú no está disponible en este momento. Intentá más tarde 🙏';
  }

  upsertSession(phone, {
    state: 'browsing_categories',
    // Store category list in session as JSON string via a hacky but type-safe way
    // We'll re-fetch from menu cache each time; just set state
  });

  let msg = `🛒 *¿Qué te gustaría pedir?*\n\n`;
  visibleCategories.forEach((cat, i) => {
    const emoji = cat.emoji || '🍽️';
    const name = cat.name_es || cat.name;
    msg += `${i + 1}. ${emoji} ${name}\n`;
  });
  msg += `\n0. ❌ Cancelar`;
  return msg;
}

// ── Step: Category chosen → show items ───────────────────────────────────────

async function handleCategoryChoice(text: string, phone: string): Promise<string> {
  const { categories, items } = await getMenu();

  const visibleCategories = categories.filter((cat) =>
    items.some((item) => item.category_id === cat.id),
  );

  const num = parseInt(text, 10);
  if (isNaN(num) || num < 1 || num > visibleCategories.length) {
    // Re-show categories
    let msg = `⚠️ Escribí el número de la categoría.\n\n`;
    visibleCategories.forEach((cat, i) => {
      const emoji = cat.emoji || '🍽️';
      msg += `${i + 1}. ${emoji} ${cat.name_es || cat.name}\n`;
    });
    msg += `\n0. ❌ Cancelar`;
    return msg;
  }

  const chosenCategory = visibleCategories[num - 1];
  const categoryItems = items.filter((item) => item.category_id === chosenCategory.id);

  upsertSession(phone, {
    state: 'browsing_items',
    currentCategoryIndex: num - 1,
  });

  const emoji = chosenCategory.emoji || '🍽️';
  const catName = (chosenCategory.name_es || chosenCategory.name).toUpperCase();
  let msg = `${emoji} *${catName}:*\n\n`;
  categoryItems.forEach((item, i) => {
    const name = item.name_es || item.name;
    msg += `${i + 1}. ${name} — ${formatPrice(item.price)}\n`;
  });
  msg += `\n0. 🔙 Volver`;
  return msg;
}

// ── Step: Item chosen → add to cart ──────────────────────────────────────────

async function handleItemChoice(text: string, phone: string): Promise<string> {
  const { categories, items } = await getMenu();
  const session = orderSessions.get(phone)!;

  const visibleCategories = categories.filter((cat) =>
    items.some((item) => item.category_id === cat.id),
  );

  if (text === '0') {
    // Go back to categories
    upsertSession(phone, { state: 'browsing_categories' });
    return await handleBrowsingCategories(phone);
  }

  const catIndex = session.currentCategoryIndex ?? 0;
  const chosenCategory = visibleCategories[catIndex];
  const categoryItems = items.filter((item) => item.category_id === chosenCategory.id);

  const num = parseInt(text, 10);
  if (isNaN(num) || num < 1 || num > categoryItems.length) {
    const catName = (chosenCategory.name_es || chosenCategory.name).toUpperCase();
    let msg = `⚠️ Escribí el número del plato.\n\n🍽️ *${catName}:*\n\n`;
    categoryItems.forEach((item, i) => {
      msg += `${i + 1}. ${item.name_es || item.name} — ${formatPrice(item.price)}\n`;
    });
    msg += `\n0. 🔙 Volver`;
    return msg;
  }

  const chosenItem = categoryItems[num - 1];
  const itemName = chosenItem.name_es || chosenItem.name;

  // Add to cart or increase quantity
  const existingIdx = session.cart.findIndex((ci) => ci.id === chosenItem.id);
  const newCart = [...session.cart];
  if (existingIdx >= 0) {
    newCart[existingIdx] = { ...newCart[existingIdx], quantity: newCart[existingIdx].quantity + 1 };
  } else {
    newCart.push({ id: chosenItem.id, name: itemName, price: chosenItem.price, quantity: 1 });
  }

  upsertSession(phone, { state: 'cart', cart: newCart });

  const total = cartTotal(newCart);
  let msg = `✅ *${itemName}* agregado!\n\n`;
  msg += `*Tu pedido:*\n${formatCart(newCart)}\n\n`;
  msg += `*Total: ${formatPrice(total)}*\n\n`;
  msg += `¿Qué hacés?\n1. ➕ Agregar más\n2. ✅ Confirmar pedido\n\n0. ❌ Cancelar`;
  return msg;
}

// ── Step: Cart actions ────────────────────────────────────────────────────────

async function handleCartChoice(text: string, phone: string): Promise<string> {
  const session = orderSessions.get(phone)!;

  if (text === '1') {
    upsertSession(phone, { state: 'browsing_categories' });
    return await handleBrowsingCategories(phone);
  }

  if (text === '2') {
    upsertSession(phone, { state: 'awaiting_name' });
    return `¿A nombre de quién es el pedido?`;
  }

  // Re-show cart options
  const total = cartTotal(session.cart);
  let msg = `*Tu pedido:*\n${formatCart(session.cart)}\n\n`;
  msg += `*Total: ${formatPrice(total)}*\n\n`;
  msg += `Escribí:\n1. ➕ Agregar más\n2. ✅ Confirmar pedido\n\n0. ❌ Cancelar`;
  return msg;
}

// ── Step: Name input ──────────────────────────────────────────────────────────

async function handleNameInput(text: string, phone: string): Promise<string> {
  const name = text.trim();
  if (name.length < 2) {
    return `Por favor ingresá tu nombre para el pedido 😊`;
  }

  upsertSession(phone, { customerName: name, state: 'awaiting_payment_choice' });

  return `¿Cómo querés pagar?\n\n1. 💵 En el local (efectivo/transferencia)\n2. 📱 Pagar ahora (MercadoPago)\n\n0. ❌ Cancelar`;
}

// ── Step: Payment choice ──────────────────────────────────────────────────────

async function handlePaymentChoice(text: string, phone: string): Promise<string> {
  const session = orderSessions.get(phone)!;

  if (text === '1') {
    // Pay at local
    try {
      const orderId = await createSupabaseOrder(session, 'efectivo', 'pending');
      upsertSession(phone, { state: 'confirmed', pendingOrderId: orderId });
      const total = cartTotal(session.cart);
      return buildConfirmationMessage(session.customerName, total);
    } catch (err) {
      console.error('[Order] Error creating order:', err);
      return `❌ Hubo un error al registrar tu pedido. Por favor intentá de nuevo o contactanos directamente.`;
    }
  }

  if (text === '2') {
    // MercadoPago
    try {
      const { createMercadoPagoPreference } = await import('./mercadopago');
      const checkoutUrl = await createMercadoPagoPreference(session);

      // Insert order as pending payment
      const orderId = await createSupabaseOrder(session, 'mercadopago', 'pending');
      upsertSession(phone, { state: 'awaiting_payment', pendingOrderId: orderId });

      const total = cartTotal(session.cart);
      return (
        `💳 *Pagá tu pedido online:*\n\n` +
        `👇 Hacé clic en el siguiente link:\n${checkoutUrl}\n\n` +
        `*Total: ${formatPrice(total)}*\n\n` +
        `Cuando acreditemos el pago, tu pedido entra directo a cocina 🍽️\n` +
        `_Si preferís pagar en el local, respondé *1* ahora._`
      );
    } catch (err) {
      console.error('[Order] MercadoPago error:', err);
      // Fallback to cash
      try {
        const orderId = await createSupabaseOrder(session, 'mercadopago', 'pending');
        upsertSession(phone, { state: 'confirmed', pendingOrderId: orderId });
        const total = cartTotal(session.cart);
        return (
          `⚠️ No pudimos generar el link de pago en este momento.\n\n` +
          buildConfirmationMessage(session.customerName, total) +
          `\n\n_Podés pagar al retirar tu pedido._`
        );
      } catch {
        return `❌ Hubo un error al registrar tu pedido. Contactanos directamente 🙏`;
      }
    }
  }

  // If they respond '1' in awaiting_payment state (pay at local after seeing MP link)
  return `Escribí:\n1. 💵 Pagar en el local\n2. 📱 Pagar con MercadoPago\n\n0. ❌ Cancelar`;
}

// ── Step: Awaiting MP payment ─────────────────────────────────────────────────

function handleAwaitingPayment(text: string, phone: string): string {
  const session = orderSessions.get(phone)!;

  // If they want to switch to cash
  if (text === '1') {
    // Update payment method to efectivo
    if (session.pendingOrderId) {
      void Promise.resolve(
        supabase
          .from('orders')
          .update({ payment_method: 'efectivo' })
          .eq('id', session.pendingOrderId),
      ).catch(() => {});
    }
    upsertSession(phone, { state: 'confirmed' });
    const total = cartTotal(session.cart);
    return buildConfirmationMessage(session.customerName, total);
  }

  return (
    `⏳ Esperando confirmación de pago...\n\n` +
    `Si querés pagar en el local en cambio, respondé *1*.\n` +
    `Para cancelar escribí *0*.`
  );
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

// ── Public: check if text is an order trigger ─────────────────────────────────

export function isOrderTrigger(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    t === 'pedir' ||
    t === 'pedido' ||
    t === 'hacer pedido' ||
    t === 'quiero pedir' ||
    t === 'ordenar' ||
    t === 'orden' ||
    t === 'quiero ordenar'
  );
}
