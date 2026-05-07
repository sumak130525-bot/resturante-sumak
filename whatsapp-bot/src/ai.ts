import { GoogleGenerativeAI } from '@google/generative-ai';
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

// ── Gemini client (lazy init, primary) ───────────────────────────────────────
let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI | null {
  const key = process.env.GEMINI_API_KEY || config.aiApiKey;
  if (!key) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(key);
  }
  return geminiClient;
}

// ── Groq client (lazy init, fallback) ────────────────────────────────────────
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: key });
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
  note?: string;
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
5. Cuando muestres el menú, usá los precios exactos del MENÚ ACTUAL de abajo. NUNCA muestres los IDs/UUIDs al cliente — esos son solo para las acciones internas.
6. NUNCA inventes platos o precios. Solo los que están en MENÚ ACTUAL.
7. Al mostrar el menú al cliente, usá solo el nombre y precio. Ejemplo: "🍲 Sopa de Maní — $5.000"
8. NO seas insistente con ventas adicionales. Si el cliente pide algo, no preguntes "¿querés algo más?". Solo sugerí algo extra si hay oportunidad natural (ej: "también tenemos bebidas por si te interesa").
9. Si piden hablar con una persona, respondé EXACTAMENTE con: "HANDOFF_TO_HUMAN"
10. Podés responder en inglés o quechua si el cliente escribe en esos idiomas
11. Recordá que el cliente puede también pedir desde la web: https://restaurante-sumak.vercel.app

CÓMO TOMAR PEDIDOS (SÉ DIRECTO, NO DES VUELTAS):
- Cuando el cliente pida algo, confirmá el item con el precio y preguntá su nombre en el MISMO mensaje. Ejemplo: "✅ 1x Pescado Sábalo Frito — $18.000. ¿A nombre de quién es el pedido?"
- Cuando el cliente diga su nombre (o ya lo tengas), creá el pedido INMEDIATAMENTE con pago "efectivo" por defecto. No preguntes método de pago a menos que el cliente lo mencione.
- Si el cliente dice "quiero X y Y", agregá todos los items y pedí nombre.
- Si el cliente dice "sí" o "dale" o "ok" después de confirmar item + dar nombre, creá el pedido.
- NO hagas preguntas innecesarias como "¿querés algo más?" o "¿seguro?". Si quieren más, ellos lo dicen.
- El flujo ideal es: Cliente pide → Vos confirmás + pedís nombre → Cliente da nombre → Vos creás el pedido. MÁXIMO 3 mensajes.

ACCIONES ESTRUCTURADAS:
Cuando necesites agregar items, crear pedidos, etc, agregá UN bloque de acciones AL FINAL de tu mensaje (después de tu texto). El cliente NO ve este bloque. Formato EXACTO:

[ACTIONS]{"actions":[{"action":"ADD_ITEM","item_id":"UUID","item_name":"Nombre","price":1000,"quantity":1}]}[/ACTIONS]

Acciones disponibles:
- ADD_ITEM: {"action":"ADD_ITEM","item_id":"UUID","item_name":"Nombre","price":PRECIO,"quantity":1,"note":"FRITAS"}
- REMOVE_ITEM: {"action":"REMOVE_ITEM","item_id":"UUID"}
- SET_NAME: {"action":"SET_NAME","name":"Nombre"}
- CREATE_ORDER: {"action":"CREATE_ORDER","payment_method":"efectivo"} (o "mercadopago")
- CLEAR_CART: {"action":"CLEAR_CART"}

NOTA EN ADD_ITEM: Si el cliente especifica una variante o detalle (ej: "fritas", "al horno", "sin arroz", "solo con papas", "bien cocida"), incluí el campo "note" en ADD_ITEM con esa aclaración EN MAYÚSCULAS. Si no hay aclaración, no incluyas "note".

REGLAS DE ACCIONES:
- Siempre usá el formato [ACTIONS]{"actions":[...]}[/ACTIONS]
- NUNCA muestres el bloque [ACTIONS] como texto visible al cliente
- Antes de CREATE_ORDER necesitás: al menos 1 item en carrito + nombre del cliente (SET_NAME). El método de pago es "efectivo" por defecto.
- Después de CREATE_ORDER el sistema confirma automáticamente al cliente

MENÚ ACTUAL (USALO TAL CUAL — NO INVENTES PLATOS NI PRECIOS):
${menuData}

IMPORTANTE: Los precios y platos de arriba son los ÚNICOS que existen. Los UUIDs de cada plato aparecen entre corchetes al inicio de cada línea (si están disponibles). Usá esos UUIDs exactos en las acciones ADD_ITEM. NUNCA muestres los UUIDs al cliente.`;
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
    /\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/i,
    /\(ACTIONS\)([\s\S]*?)\(\/ACTIONS\)/i,
    /\(Acciones\)([\s\S]*?)\(\/Acciones\)/i,
    /\[ACTIONS\]([\s\S]*?)$/i,
    /\(ACTIONS\)([\s\S]*?)$/i,
    /\(Acciones\)([\s\S]*?)$/i,
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

  // Also strip any remaining action-like markers from visible text
  visibleText = visibleText.replace(/\[?\(?(ACTIONS|Acciones)\]?\)?/gi, '').trim();

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

  if (actions.length > 0) {
    console.log(`[AI] 📋 Parsed ${actions.length} actions:`, JSON.stringify(actions));
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

  // Fetch real menu items from DB to validate prices
  let menuItems: { id: string; name: string; price: number }[] = [];
  try {
    const { getMenu } = await import('./menu');
    const { items } = await getMenu();
    menuItems = items;
  } catch { /* use AI prices as fallback */ }

  for (const act of actions) {
    if (act.action === 'ADD_ITEM') {
      // Validate item exists in DB — reject hallucinated items
      let realPrice = act.price;
      let realName = act.item_name;
      const dbItem = menuItems.find((mi) => mi.id === act.item_id);
      if (dbItem) {
        realPrice = dbItem.price;
        realName = dbItem.name;
      } else {
        // Item doesn't exist in DB — skip it entirely (AI hallucinated)
        console.warn(`[AI] ❌ Item ${act.item_id} ("${act.item_name}") not found in DB — skipping`);
        continue;
      }

      const existing = session.cart.findIndex((ci) => ci.id === act.item_id);
      const newCart = [...session.cart];
      if (existing >= 0) {
        // REPLACE quantity — don't accumulate (AI may resend ADD_ITEM on each message)
        newCart[existing] = {
          ...newCart[existing],
          quantity: act.quantity,
          note: act.note || newCart[existing].note,
        };
      } else {
        newCart.push({
          id: act.item_id,
          name: realName,
          price: realPrice,
          quantity: act.quantity,
          note: act.note || undefined,
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
      if (session.cart.length === 0) {
        console.warn('[AI] ❌ CREATE_ORDER blocked — cart is empty');
        continue;
      }
      // Block order creation if no customer name set
      if (!session.customerName || session.customerName.trim() === '' || session.customerName === 'Nombre del cliente') {
        console.warn(`[AI] ❌ CREATE_ORDER blocked — no customer name set (got: "${session.customerName}")`);
        continue;
      }
      console.log(`[AI] ✅ CREATE_ORDER proceeding — name: "${session.customerName}", cart: ${session.cart.length} items, total: ${cartTotal(session.cart)}`);

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

// ── Gemini response (primary) ─────────────────────────────────────────────────
async function generateWithGemini(
  userMessage: string,
  systemPrompt: string,
  conversationHistory: ConversationTurn[],
): Promise<string> {
  const client = getGeminiClient();
  if (!client) throw new Error('GEMINI_API_KEY not set');

  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 700,
    },
  });

  const history = conversationHistory.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text().trim();
}

// ── Groq response (fallback) ──────────────────────────────────────────────────
async function generateWithGroq(
  userMessage: string,
  systemPrompt: string,
  conversationHistory: ConversationTurn[],
): Promise<string> {
  const client = getGroqClient();
  if (!client) throw new Error('AI_API_KEY not set');

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

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

  return (completion.choices[0]?.message?.content ?? '').trim();
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function generateResponse(
  userMessage: string,
  menuData: string,
  conversationHistory: ConversationTurn[] = [],
  phone?: string,
): Promise<AIResponse> {
  if (!isAIAvailable()) {
    throw new Error('No AI API key configured (GEMINI_API_KEY or AI_API_KEY)');
  }

  // Get current cart state for context
  const cartSession: CartSession | undefined = phone ? getCartSession(phone) : undefined;
  const cart = cartSession?.cart ?? [];
  const customerName = cartSession?.customerName ?? '';

  const systemPrompt = buildSystemPrompt(menuData, cart, customerName);

  // Try Gemini first, fall back to Groq
  let rawResponse: string;
  const hasGemini = !!(process.env.GEMINI_API_KEY || config.aiApiKey);
  const hasGroq = !!process.env.AI_API_KEY;

  if (hasGemini) {
    try {
      rawResponse = await generateWithGemini(userMessage, systemPrompt, conversationHistory);
      console.log('[AI] Using Gemini 2.0 Flash');
    } catch (err) {
      console.warn('[AI] Gemini failed, trying Groq fallback:', err);
      if (!hasGroq) throw err;
      rawResponse = await generateWithGroq(userMessage, systemPrompt, conversationHistory);
      console.log('[AI] Using Groq fallback');
    }
  } else {
    rawResponse = await generateWithGroq(userMessage, systemPrompt, conversationHistory);
    console.log('[AI] Using Groq');
  }

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
  return !!(process.env.GEMINI_API_KEY || config.aiApiKey || process.env.AI_API_KEY);
}
