import Groq from 'groq-sdk';
import { config } from './config';
import {
  CartItem,
  CartSession,
  getCartSession,
  upsertCartSession,
  clearCartSession,
  createSupabaseOrder,
  buildConfirmationMessage,
  cartTotal,
  formatCart,
  formatPrice,
} from './order';

// ── Cliente Groq (lazy init) ──────────────────────────────────────────────────
let groqClient: Groq | null = null;

function getClient(): Groq | null {
  if (!config.aiApiKey) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: config.aiApiKey });
  }
  return groqClient;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface ConversationTurn {
  role: string;
  text: string;
}

export interface AIResponse {
  text: string;
  handoffToHuman: boolean;
}

// ── Parsed action from AI response ───────────────────────────────────────────

interface ActionAddItem {
  action: 'ADD_ITEM';
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
}

interface ActionRemoveItem {
  action: 'REMOVE_ITEM';
  item_id: string;
}

interface ActionSetName {
  action: 'SET_NAME';
  name: string;
}

interface ActionCreateOrder {
  action: 'CREATE_ORDER';
  payment_method: 'efectivo' | 'mercadopago';
}

interface ActionClearCart {
  action: 'CLEAR_CART';
}

type BotAction = ActionAddItem | ActionRemoveItem | ActionSetName | ActionCreateOrder | ActionClearCart;

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(menuData: string, cart: CartItem[], customerName: string): string {
  const cartSummary =
    cart.length === 0
      ? 'Carrito vacío'
      : formatCart(cart) + `\nTotal: ${formatPrice(cartTotal(cart))}`;

  return `Sos Sumak Bot, el asistente virtual del Restaurante Sumak en Mendoza, Argentina.
Tu trabajo es atender clientes por WhatsApp de forma amigable, cálida y eficiente.
Podés responder cualquier pregunta Y también tomar pedidos conversacionalmente.

DATOS DEL RESTAURANTE:
- Nombre: Restaurante Sumak
- Dirección: Juan B Alberdi 247, frente a la Terminal de Mendoza, Guaymallén
- Google Maps: https://maps.google.com/?q=-32.8949528,-68.8286573
- Horario: Lunes a Sábado 8:00 a 22:30. Domingos cerrado.
- WhatsApp: +54 9 261 752 6242
- Web: https://restaurante-sumak.vercel.app
- Facebook: https://www.facebook.com/profile.php?id=61576603961881
- Especialidad: Comida boliviana y andina
- Moneda: Pesos argentinos (ARS), usar formato $X.XXX

SERVICIO DISPONIBLE:
- Solo retiro en el local (takeaway). NO hay delivery ni envío a domicilio.
- También pueden ver el menú completo y pedir en: https://restaurante-sumak.vercel.app

ESTADO ACTUAL DEL CARRITO:
${cartSummary}
${customerName ? `Nombre del cliente: ${customerName}` : 'Nombre: no registrado aún'}

REGLAS DE CONVERSACIÓN:
1. Respondé SIEMPRE en español rioplatense (vos, tenés, querés) a menos que el cliente escriba en otro idioma
2. Sé breve y directo. Esto es WhatsApp. Máximo ~400 caracteres en el texto visible.
3. Usá emojis con moderación (1-3 por mensaje)
4. NUNCA menciones delivery ni envío a domicilio. Solo existe retiro en el local.
5. Cuando muestres el menú, usá los precios exactos del MENÚ ACTUAL de abajo.
6. NUNCA inventes platos o precios. Solo los que están en MENÚ ACTUAL.
7. Siempre intentá vender más: sugerí bebidas, postres, combos cuando el cliente hace un pedido.
8. Si piden hablar con una persona, respondé EXACTAMENTE con: "HANDOFF_TO_HUMAN"
9. Podés responder en inglés o quechua si el cliente escribe en esos idiomas
10. Recordá que el cliente puede también pedir desde la web: https://restaurante-sumak.vercel.app

CÓMO TOMAR PEDIDOS:
- El cliente puede pedirte directamente lo que quiere, ej: "quiero una sopa de maní"
- Podés sugerirles categorías o items del menú
- Cuando el cliente confirme un item, incluí una acción ADD_ITEM en tu respuesta
- Cuando el cliente quiera confirmar el pedido completo, pedí su nombre si no lo tenés
- Cuando tengas nombre y el pedido confirmado, pedí preferencia de pago
- Cuando el cliente confirme el pago, incluí CREATE_ORDER en tu respuesta

ACCIONES ESTRUCTURADAS:
Cuando necesites agregar items, crear pedidos, etc, agregá UN bloque de acciones AL FINAL de tu mensaje (después de tu texto). El cliente NO ve este bloque. Formato EXACTO:

[ACTIONS]{"actions":[{"action":"ADD_ITEM","item_id":"UUID","item_name":"Nombre","price":1000,"quantity":1}]}[/ACTIONS]

Acciones disponibles:
- ADD_ITEM: {"action":"ADD_ITEM","item_id":"UUID","item_name":"Nombre","price":PRECIO,"quantity":1}
- REMOVE_ITEM: {"action":"REMOVE_ITEM","item_id":"UUID"}
- SET_NAME: {"action":"SET_NAME","name":"Nombre"}
- CREATE_ORDER: {"action":"CREATE_ORDER","payment_method":"efectivo"} (o "mercadopago")
- CLEAR_CART: {"action":"CLEAR_CART"}

REGLAS DE ACCIONES:
- Siempre usá el formato [ACTIONS]{"actions":[...]}[/ACTIONS]
- NUNCA muestres el bloque [ACTIONS] como texto visible al cliente
- Antes de CREATE_ORDER necesitás: al menos 1 item en carrito + nombre del cliente + método de pago confirmado
- Después de CREATE_ORDER el sistema confirma automáticamente al cliente

ESTRATEGIAS DE VENTA:
- Si piden un segundo, sugerí una sopa de entrada
- Si piden comida, preguntá si quieren bebida
- Si no saben qué pedir, recomendá los más populares (Picante de Pollo, Silpancho, Sopa de Maní)
- Mencioná el Menú del Día si preguntan por algo económico

MENÚ ACTUAL (USALO TAL CUAL — NO INVENTES PLATOS NI PRECIOS):
${menuData}

IMPORTANTE: Los precios y platos de arriba son los ÚNICOS que existen. Los UUIDs de cada plato aparecen entre corchetes al inicio de cada línea (si están disponibles). Usá esos UUIDs exactos en las acciones ADD_ITEM.`;
}

// ── Build menu with IDs for AI ────────────────────────────────────────────────
export async function formatMenuWithIds(): Promise<string> {
  try {
    const { getMenu } = await import('./menu');
    const { items, categories } = await getMenu();

    if (items.length === 0) {
      const { getStaticMenu } = await import('./menu');
      return getStaticMenu();
    }

    let text = '';
    for (const category of categories) {
      const categoryItems = items.filter((item) => item.category_id === category.id);
      if (categoryItems.length === 0) continue;

      const catName = category.name_es || category.name;
      text += `\n${category.emoji || '🍽️'} ${catName.toUpperCase()}:\n`;

      for (const item of categoryItems) {
        const name = item.name_es || item.name;
        const price = item.price;
        text += `  [${item.id}] ${name} — $${price.toLocaleString('es-AR')}`;
        if (item.description_es) {
          text += ` (${item.description_es.trim()})`;
        }
        text += '\n';
      }
    }

    return text.trim();
  } catch {
    const { getStaticMenu } = await import('./menu');
    return getStaticMenu();
  }
}

// ── Parse actions from AI response ───────────────────────────────────────────

interface ParsedResponse {
  visibleText: string;
  actions: BotAction[];
}

function parseAIResponse(raw: string): ParsedResponse {
  // Try multiple patterns the AI might use
  const patterns = [
    /\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/,
    /\[ACTIONS\]([\s\S]*?)$/,  // Missing closing tag
    /\[actions\]([\s\S]*?)\[\/actions\]/i,
  ];

  let actionJson: string | null = null;
  let visibleText = raw;

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      actionJson = match[1].trim();
      visibleText = raw.replace(pattern, '').trim();
      break;
    }
  }

  const actions: BotAction[] = [];
  if (actionJson) {
    try {
      // Try as {"actions":[...]} format
      const parsed = JSON.parse(actionJson) as { actions?: BotAction[]; action?: string };
      if (Array.isArray(parsed.actions)) {
        actions.push(...parsed.actions);
      } else if (parsed.action) {
        // Single action object like {"action":"CREATE_ORDER","payment_method":"efectivo"}
        actions.push(parsed as unknown as BotAction);
      }
    } catch {
      // Try to find any JSON object with "action" key
      const jsonMatch = actionJson.match(/\{[^}]*"action"[^}]*\}/g);
      if (jsonMatch) {
        for (const j of jsonMatch) {
          try {
            actions.push(JSON.parse(j) as BotAction);
          } catch { /* skip */ }
        }
      }
    }
  }

  return { visibleText, actions };
}

// ── Apply actions to cart session ─────────────────────────────────────────────

interface ApplyResult {
  confirmationMessage?: string;
  mercadoPagoUrl?: string;
}

async function applyActions(
  actions: BotAction[],
  phone: string,
): Promise<ApplyResult> {
  let session = getCartSession(phone) ?? { cart: [], customerName: '', phone, lastActive: Date.now() };
  const result: ApplyResult = {};

  for (const act of actions) {
    if (act.action === 'ADD_ITEM') {
      const existing = session.cart.findIndex((ci) => ci.id === act.item_id);
      const newCart = [...session.cart];
      if (existing >= 0) {
        newCart[existing] = {
          ...newCart[existing],
          quantity: newCart[existing].quantity + act.quantity,
        };
      } else {
        newCart.push({
          id: act.item_id,
          name: act.item_name,
          price: act.price,
          quantity: act.quantity,
        });
      }
      session = upsertCartSession(phone, { cart: newCart });

    } else if (act.action === 'REMOVE_ITEM') {
      const newCart = session.cart.filter((ci) => ci.id !== act.item_id);
      session = upsertCartSession(phone, { cart: newCart });

    } else if (act.action === 'SET_NAME') {
      session = upsertCartSession(phone, { customerName: act.name });

    } else if (act.action === 'CLEAR_CART') {
      session = upsertCartSession(phone, { cart: [] });

    } else if (act.action === 'CREATE_ORDER') {
      if (session.cart.length === 0) continue;

      const paymentMethod = act.payment_method;

      if (paymentMethod === 'mercadopago') {
        try {
          const { createMercadoPagoPreference } = await import('./mercadopago');
          const checkoutUrl = await createMercadoPagoPreference(session);
          await createSupabaseOrder(session, 'mercadopago', 'pending');
          result.mercadoPagoUrl = checkoutUrl;
          const total = cartTotal(session.cart);
          result.confirmationMessage = (
            `💳 *Pagá tu pedido online:*\n\n` +
            `👇 Hacé clic en el siguiente link:\n${checkoutUrl}\n\n` +
            `*Total: ${formatPrice(total)}*\n\n` +
            `Cuando acreditemos el pago, tu pedido entra directo a cocina 🍽️\n` +
            `_Si preferís pagar en el local, avisame y lo registro igual._`
          );
        } catch {
          // Fallback to efectivo
          await createSupabaseOrder(session, 'mercadopago', 'pending');
          const total = cartTotal(session.cart);
          result.confirmationMessage =
            `⚠️ No pudimos generar el link de MercadoPago ahora.\n\n` +
            buildConfirmationMessage(session.customerName, total) +
            `\n\n_Podés pagar al retirar._`;
        }
      } else {
        await createSupabaseOrder(session, 'efectivo', 'pending');
        const total = cartTotal(session.cart);
        result.confirmationMessage = buildConfirmationMessage(session.customerName, total);
      }

      clearCartSession(phone);
      break;
    }
  }

  return result;
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function generateResponse(
  userMessage: string,
  menuData: string,
  conversationHistory: ConversationTurn[] = [],
  phone?: string,
): Promise<AIResponse> {
  const client = getClient();

  if (!client) {
    throw new Error('AI_API_KEY no configurada');
  }

  // Get current cart state for context
  const cartSession: CartSession | undefined = phone ? getCartSession(phone) : undefined;
  const cart = cartSession?.cart ?? [];
  const customerName = cartSession?.customerName ?? '';

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: buildSystemPrompt(menuData, cart, customerName) },
  ];

  // Add conversation history
  for (const turn of conversationHistory) {
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    });
  }

  messages.push({ role: 'user', content: userMessage });

  const completion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages,
    max_tokens: 700,
    temperature: 0.7,
  });

  const rawResponse = (completion.choices[0]?.message?.content ?? '').trim();

  // Detect handoff
  if (rawResponse === 'HANDOFF_TO_HUMAN' || rawResponse.includes('HANDOFF_TO_HUMAN')) {
    return {
      text: 'Te comunico con nuestro equipo 🙌',
      handoffToHuman: true,
    };
  }

  // Parse actions and visible text
  const { visibleText, actions } = parseAIResponse(rawResponse);

  // Apply actions if phone is provided
  let finalText = visibleText;
  if (phone && actions.length > 0) {
    try {
      const result = await applyActions(actions, phone);
      // If CREATE_ORDER was processed, override the text with the confirmation
      if (result.confirmationMessage) {
        finalText = result.confirmationMessage;
      }
    } catch (err) {
      console.error('[AI] Error applying actions:', err);
    }
  }

  return {
    text: finalText,
    handoffToHuman: false,
  };
}

export function isAIAvailable(): boolean {
  return !!config.aiApiKey;
}
