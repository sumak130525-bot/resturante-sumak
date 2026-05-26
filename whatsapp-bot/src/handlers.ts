import { config } from './config';
import { formatMenuText, getStaticMenu } from './menu';
import { generateResponse, formatMenuWithIds, isAIAvailable } from './ai';
import { getHistory, addTurn, clearSession } from './conversation';

const { restaurant } = config;

// ── Constantes ────────────────────────────────────────────────────────────────

const TZ = 'America/Argentina/Mendoza';

// Cache de estado de cierre (5 minutos)
let _closureCache: {
  dayClosed: boolean;
  dayReason: string | null;
  kitchenClosed: boolean;
  kitchenReason: string | null;
  fetchedAt: number;
} | null = null;
const CLOSURE_CACHE_TTL_MS = 5 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isOpen(): boolean {
  const now = new Date();
  const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  const day = argentinaTime.getDay();   // 0 = Sunday
  const hours = argentinaTime.getHours();
  const minutes = argentinaTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (day === 0) return false; // Sunday — always closed
  // Monday–Saturday: 8:00 to 22:30
  return totalMinutes >= 8 * 60 && totalMinutes < 22 * 60 + 30;
}

function getTodayMendoza(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

function isDateInRange(today: string, start: string, end: string | null): boolean {
  if (end) return today >= start && today <= end;
  return today === start;
}

/**
 * Obtiene el estado de cierre del restaurante desde las APIs web.
 * Usa cache de 5 minutos para evitar exceso de llamadas.
 */
async function getRestaurantClosureStatus(): Promise<{
  dayClosed: boolean;
  dayReason: string | null;
  kitchenClosed: boolean;
  kitchenReason: string | null;
}> {
  const now = Date.now();

  // Devolver desde cache si es reciente
  if (_closureCache && now - _closureCache.fetchedAt < CLOSURE_CACHE_TTL_MS) {
    return _closureCache;
  }

  const defaultResult = { dayClosed: false, dayReason: null, kitchenClosed: false, kitchenReason: null };

  try {
    const baseUrl = restaurant.web;

    const [daysRes, kitchenRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/admin/closure-days`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${baseUrl}/api/admin/kitchen-status`, { signal: AbortSignal.timeout(5000) }),
    ]);

    let dayClosed = false;
    let dayReason: string | null = null;
    let kitchenClosed = false;
    let kitchenReason: string | null = null;

    // Verificar días de cierre
    if (daysRes.status === 'fulfilled' && daysRes.value.ok) {
      const days = await daysRes.value.json() as Array<{
        start_date: string;
        end_date: string | null;
        reason: string;
      }>;
      const today = getTodayMendoza();
      const active = days.find((d) => isDateInRange(today, d.start_date, d.end_date));
      if (active) {
        dayClosed = true;
        dayReason = active.reason;
      }
    }

    // Verificar estado de cocina
    if (kitchenRes.status === 'fulfilled' && kitchenRes.value.ok) {
      const kitchen = await kitchenRes.value.json() as {
        effective_closed: boolean;
        reason: string | null;
      };
      kitchenClosed = kitchen.effective_closed ?? false;
      kitchenReason = kitchen.reason ?? null;
    }

    const result = { dayClosed, dayReason, kitchenClosed, kitchenReason };
    _closureCache = { ...result, fetchedAt: now };
    return result;

  } catch (err) {
    console.error('[Closure] Error al obtener estado de cierre:', err);
    return defaultResult;
  }
}

export function getClosedMessage(): string {
  return (
    'Hola! 👋 En este momento Restaurante Sumak se encuentra *cerrado*.\n\n' +
    'Nuestro horario de atención es:\n' +
    '📅 Lunes a Sábado de 8:00 a 22:30\n\n' +
    'Te esperamos! 🌿\n\n' +
    '_Sumak Bot 🤖_'
  );
}

function getDayClosedMessage(reason: string): string {
  return (
    'Hola! 👋 Hoy *Restaurante Sumak* se encuentra *cerrado*.\n\n' +
    `📋 Motivo: ${reason}\n\n` +
    'Te esperamos muy pronto! 🌿\n\n' +
    '_Sumak Bot 🤖_'
  );
}

function getKitchenClosedNotice(reason?: string | null): string {
  return (
    `\n\n⚠️ *Aviso:* La cocina está temporalmente cerrada` +
    (reason ? ` (${reason})` : '') +
    '. Por favor consultá nuevamente más tarde.'
  );
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function containsAny(text: string, keywords: string[]): boolean {
  const n = normalize(text);
  return keywords.some((kw) => n.includes(kw));
}

// ── Mensajes predefinidos (también usados como fallback) ──────────────────────

export function getWelcomeMessage(): string {
  return (
    `¡Hola! 👋 Bienvenido/a a *Restaurante Sumak* 🌿\n\n` +
    `Somos un restaurante de comida andina en el corazón de Mendoza.\n\n` +
    `¿En qué te puedo ayudar?\n\n` +
    `📋 *menu* — Ver el menú completo\n` +
    `🕐 *horario* — Horarios de atención\n` +
    `📍 *ubicacion* — Dónde encontrarnos\n` +
    `🛒 Escribí lo que querés pedir y te ayudo enseguida\n` +
    `💳 *pagar* — Métodos de pago\n\n` +
    `Para hablar con una persona, escribí *humano* 😊\n\n` +
    `_Sumak Bot 🤖_`
  );
}

export function getHorariosMessage(): string {
  return (
    `🕐 *HORARIOS DE ATENCIÓN*\n\n` +
    `📅 ${restaurant.hours}\n\n` +
    `Te esperamos en Sumak 🌿\n\n` +
    `_Sumak Bot 🤖_`
  );
}

export function getUbicacionMessage(): string {
  return (
    `📍 *DÓNDE ESTAMOS*\n\n` +
    `📌 ${restaurant.address}\n\n` +
    `🗺️ Google Maps:\n${restaurant.maps}\n\n` +
    `¡Te esperamos! 🌿\n\n` +
    `_Sumak Bot 🤖_`
  );
}

export function getPagoMessage(): string {
  return (
    `💳 *MÉTODOS DE PAGO*\n\n` +
    `Aceptamos:\n` +
    `✅ Efectivo\n` +
    `✅ Tarjetas de débito y crédito\n` +
    `✅ MercadoPago\n` +
    `✅ Transferencia bancaria\n\n` +
    `Para pedir por WhatsApp, escribime lo que querés 📱\n\n` +
    `También podés pedir desde:\n🌐 ${restaurant.web}\n\n` +
    `_Sumak Bot 🤖_`
  );
}

export function getHumanoMessage(): string {
  return (
    `👤 *ATENCIÓN PERSONALIZADA*\n\n` +
    `Para hablar con alguien del equipo Sumak:\n\n` +
    `📞 Llamanos al +${restaurant.phone}\n` +
    `🌐 O visitá: ${restaurant.web}\n\n` +
    `¡Estaremos encantados de atenderte! 🌿\n\n` +
    `_Sumak Bot 🤖_`
  );
}

export function getDefaultMessage(): string {
  return (
    `Hola 👋 Soy Sumak Bot 🤖\n\n` +
    `No entendí muy bien tu mensaje, pero puedo ayudarte con:\n\n` +
    `📋 *menu* — Ver el menú completo\n` +
    `🕐 *horario* — Horarios de atención\n` +
    `📍 *ubicacion* — Dónde encontrarnos\n` +
    `🛒 Escribí lo que querés pedir\n` +
    `💳 *pagar* — Métodos de pago\n` +
    `👤 *humano* — Hablar con una persona\n\n` +
    `_Sumak Bot 🤖_`
  );
}

// ── Fallback estático (respuestas por keyword matching) ───────────────────────

export async function handleMessageFallback(text: string): Promise<string> {
  // Verificar cierre especial del día (días cerrados)
  const closure = await getRestaurantClosureStatus();
  if (closure.dayClosed) {
    return getDayClosedMessage(closure.dayReason ?? 'Día de cierre especial');
  }

  if (!isOpen()) return getClosedMessage();

  const t = text.trim();

  if (
    containsAny(t, ['hola', 'buenas', 'buenos', 'hi ', 'hello', 'hey', 'buen dia', 'buen tarde', 'buen noche', 'ola'])
    || t.toLowerCase() === 'hi'
    || t.toLowerCase() === 'hola'
  ) {
    return getWelcomeMessage();
  }

  if (containsAny(t, ['humano', 'persona', 'hablar con', 'operador', 'atencion'])) {
    return getHumanoMessage();
  }

  if (containsAny(t, ['menu', 'carta', 'platos', 'que tienen', 'que hay', 'comida'])) {
    try {
      let response = await formatMenuText();
      if (closure.kitchenClosed) response += getKitchenClosedNotice(closure.kitchenReason);
      return response;
    } catch {
      return getStaticMenu();
    }
  }

  if (containsAny(t, ['horario', 'hora', 'cuando abren', 'cuando cierran', 'abierto', 'cerrado', 'atienden'])) {
    return getHorariosMessage();
  }

  if (
    containsAny(t, ['ubicacion', 'ubicación', 'donde', 'dónde', 'direccion', 'dirección', 'como llegar', 'maps', 'mapa', 'local'])
  ) {
    return getUbicacionMessage();
  }

  if (containsAny(t, ['pagar', 'pago', 'mercadopago', 'efectivo', 'tarjeta', 'debito', 'credito', 'transferencia'])) {
    return getPagoMessage();
  }

  return getDefaultMessage();
}

// ── Router principal con IA ───────────────────────────────────────────────────

export async function handleMessage(text: string, phone?: string): Promise<string> {
  // Verificar cierre especial del día primero (prioridad máxima)
  const closure = await getRestaurantClosureStatus();
  if (closure.dayClosed) {
    return getDayClosedMessage(closure.dayReason ?? 'Día de cierre especial');
  }

  if (!isOpen()) return getClosedMessage();

  const t = text.trim();

  // ── Notify admin of incoming message (non-blocking) ─────────────────────────
  if (phone) {
    fetch(`${config.restaurant.web}/api/admin/whatsapp-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message: t, sender_name: phone }),
    }).catch(() => {});
  }

  // ── AI mode: AI handles ALL conversations including ordering ─────────────────
  if (!isAIAvailable()) {
    console.log('⚠️  Groq no configurado, usando respuestas estáticas');
    return handleMessageFallback(text);
  }

  try {
    // Build menu with IDs so AI can reference item UUIDs in actions
    let menuData: string;
    try {
      menuData = await formatMenuWithIds();
    } catch {
      menuData = getStaticMenu();
    }

    // Agregar contexto de cocina cerrada al sistema si aplica
    const kitchenContext = closure.kitchenClosed
      ? `\n\n[CONTEXTO IMPORTANTE: La cocina está temporalmente cerrada${closure.kitchenReason ? ` (${closure.kitchenReason})` : ''}. Informá al cliente que no se pueden tomar pedidos en este momento.]`
      : '';

    const history = phone ? getHistory(phone) : [];
    const aiResponse = await generateResponse(t, menuData + kitchenContext, history, phone);

    if (phone) {
      addTurn(phone, t, aiResponse.text);

      if (aiResponse.handoffToHuman) {
        clearSession(phone);
      }
    }

    return aiResponse.text;

  } catch (err) {
    console.error('⚠️  Error con AI:', err instanceof Error ? err.message : err);

    // If there's an active cart and user message looks like a name, create order directly
    if (phone) {
      const { getCartSession, upsertCartSession, createSupabaseOrder } = await import('./order');
      const session = getCartSession(phone);
      if (session && session.cart.length > 0) {
        // Bloquear pedidos si la cocina está cerrada
        if (closure.kitchenClosed) {
          return (
            '⚠️ Lo sentimos, la cocina está temporalmente cerrada' +
            (closure.kitchenReason ? ` (${closure.kitchenReason})` : '') +
            '. No podemos procesar tu pedido en este momento. Por favor intentá más tarde.'
          );
        }

        const trimmed = text.trim();
        // User gave a name (short text, only letters/spaces, starts with common patterns)
        const looksLikeName = trimmed.length < 30 && /^(de |soy |me llamo )?[A-ZÁÉÍÓÚÑa-záéíóúñ\s]+$/i.test(trimmed);
        if (looksLikeName) {
          const name = trimmed.replace(/^(de |soy |me llamo )/i, '').trim();
          const updatedSession = upsertCartSession(phone, { customerName: name });
          console.log(`[Fallback] 📝 Cart active + name detected: "${name}" — creating order`);
          try {
            const confirmation = await createSupabaseOrder(updatedSession, 'efectivo', 'pending');
            return confirmation;
          } catch (orderErr) {
            console.error('[Fallback] Error creating order:', orderErr);
          }
        }
        // User said "si", "ok", "dale", "listo" — confirm with existing name
        if (/^(si|sí|ok|dale|listo|bueno|confirmo)$/i.test(trimmed) && session.customerName) {
          console.log(`[Fallback] ✅ Cart active + confirmation word — creating order for "${session.customerName}"`);
          try {
            const confirmation = await createSupabaseOrder(session, 'efectivo', 'pending');
            return confirmation;
          } catch (orderErr) {
            console.error('[Fallback] Error creating order:', orderErr);
          }
        }
      }
    }

    const fallback = await handleMessageFallback(text);
    return fallback + `\n\n📲 *¿Querés hacer un pedido?*\nPodés pedir desde nuestra web:\n🌐 ${restaurant.web}`;
  }
}
