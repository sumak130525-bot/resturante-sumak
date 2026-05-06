import { config } from './config';
import { formatMenuText, searchMenuItem, getStaticMenu } from './menu';
import { generateResponse, isAIAvailable } from './ai';
import { getHistory, addTurn, clearSession } from './conversation';
import {
  hasActiveOrderSession,
  handleOrderMessage,
  isOrderTrigger,
  clearOrderSession,
} from './order';

const { restaurant } = config;

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isOpen(): boolean {
  const now = new Date();
  const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Mendoza' }));
  const day = argentinaTime.getDay();   // 0 = Sunday
  const hours = argentinaTime.getHours();
  const minutes = argentinaTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (day === 0) return false; // Sunday — always closed
  // Monday–Saturday: 8:00 to 22:30
  return totalMinutes >= 8 * 60 && totalMinutes < 22 * 60 + 30;
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
    `🛒 *pedir* — Hacer un pedido para retirar\n` +
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

export function getPedidoMessage(): string {
  return (
    `🛒 *HACER UN PEDIDO*\n\n` +
    `Podés hacer tu pedido para retirar directamente por acá 👇\n\n` +
    `Escribí *pedir* y te guío paso a paso 📝\n\n` +
    `También podés ver el menú completo en:\n🌐 ${restaurant.web}\n\n` +
    `📍 Retiro en: Juan B Alberdi 247, frente a Terminal de Mendoza\n\n` +
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
    `Para pagar al pedir por WhatsApp, escribí *pedir* 📱\n\n` +
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
    `🛒 *pedir* — Hacer un pedido para retirar\n` +
    `💳 *pagar* — Métodos de pago\n` +
    `👤 *humano* — Hablar con una persona\n\n` +
    `_Sumak Bot 🤖_`
  );
}

// ── Fallback estático (respuestas por keyword matching) ───────────────────────

export async function handleMessageFallback(text: string): Promise<string> {
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
      return await formatMenuText();
    } catch {
      return getStaticMenu();
    }
  }

  if (containsAny(t, ['precio', 'cuanto', 'cuánto', 'vale', 'cuesta', 'costo'])) {
    const words = t.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (['precio', 'cuanto', 'cuánto', 'vale', 'cuesta', 'costo', 'tiene'].includes(word)) continue;
      try {
        const results = await searchMenuItem(word);
        if (results.length > 0) {
          let reply = `🔍 *Encontré esto:*\n\n`;
          for (const item of results.slice(0, 3)) {
            const name = item.name_es || item.name;
            reply += `• *${name}* — $${item.price.toLocaleString('es-AR')}\n`;
            if (item.description_es) reply += `  _${item.description_es}_\n`;
          }
          reply += `\nEscribí *menu* para ver el menú completo 📋\n\n_Sumak Bot 🤖_`;
          return reply;
        }
      } catch {
        // silencioso
      }
    }
    try {
      return await formatMenuText();
    } catch {
      return getStaticMenu();
    }
  }

  if (isOrderTrigger(t)) {
    return getPedidoMessage();
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
  if (!isOpen()) return getClosedMessage();

  const t = text.trim();

  // ── Order flow: bypass AI completely ────────────────────────────────────────
  if (phone) {
    const inOrderFlow = hasActiveOrderSession(phone);
    const triggeringOrder = isOrderTrigger(t);

    if (inOrderFlow || triggeringOrder) {
      try {
        return await handleOrderMessage(t, phone);
      } catch (err) {
        console.error('[Order flow error]', err);
        clearOrderSession(phone);
        return `❌ Algo salió mal con el pedido. Escribí *pedir* para intentar de nuevo, o contactanos: +${restaurant.phone}`;
      }
    }
  }

  // ── AI mode ──────────────────────────────────────────────────────────────────
  if (!isAIAvailable()) {
    console.log('⚠️  Groq no configurado, usando respuestas estáticas');
    return handleMessageFallback(text);
  }

  try {
    let menuData: string;
    try {
      menuData = await formatMenuText();
    } catch {
      menuData = getStaticMenu();
    }

    const history = phone ? getHistory(phone) : [];
    const aiResponse = await generateResponse(t, menuData, history);

    if (phone) {
      addTurn(phone, t, aiResponse.text);

      if (aiResponse.handoffToHuman) {
        clearSession(phone);
      }
    }

    return aiResponse.text;

  } catch (err) {
    console.error('⚠️  Error con Groq, usando fallback estático:', err instanceof Error ? err.message : err);
    return handleMessageFallback(text);
  }
}
