import Groq from 'groq-sdk';
import { config } from './config';

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

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(menuData: string): string {
  return `Sos Sumak Bot, el asistente virtual del Restaurante Sumak en Mendoza, Argentina.
Tu trabajo es atender clientes por WhatsApp de forma amigable, cálida y eficiente.

DATOS DEL RESTAURANTE:
- Nombre: Restaurante Sumak
- Dirección: Juan B Alberdi 247, frente a la Terminal de Mendoza, Guaymallén
- Google Maps: https://maps.google.com/?q=-32.8949528,-68.8286573
- Horario: Lunes a Sábado 8:00 a 22:30. Domingos cerrado. Feriados: depende del feriado, consultar.
- WhatsApp: +54 9 261 752 6242
- Web para pedir online: https://restaurante-sumak.vercel.app
- Facebook: https://www.facebook.com/profile.php?id=61576603961881
- Especialidad: Comida boliviana y andina
- Moneda: Pesos argentinos (ARS), usar formato $X.XXX

REGLAS:
1. Respondé SIEMPRE en español rioplatense (vos, tenés, querés) a menos que el cliente escriba en otro idioma
2. Sé breve y directo, no hagas párrafos largos. Esto es WhatsApp, no un email. Máximo ~400 caracteres.
3. Usá emojis con moderación (1-3 por mensaje)
4. Cuando te pregunten por el menú, mostrá los platos con precios formateados
5. Cuando un cliente quiera pedir, guialo al link de la web: https://restaurante-sumak.vercel.app
6. Siempre intentá vender más: sugerí bebidas, postres, combos
7. Si preguntan algo que no sabés, decí que vas a consultar con el equipo
8. Si piden hablar con una persona, respondé EXACTAMENTE con: "HANDOFF_TO_HUMAN"
9. NUNCA inventes platos o precios que no estén en el menú. Usá ÚNICAMENTE los precios que aparecen en MENÚ ACTUAL. Si no encontrás el precio, decí "consultá en nuestra web".
10. NUNCA des información falsa sobre horarios, ubicación, etc.
11. Podés responder en inglés o quechua si el cliente escribe en esos idiomas
12. Firmá como Sumak Bot 🤖 solo en el primer mensaje de bienvenida, después no

MENÚ ACTUAL (USALO TAL CUAL — NO INVENTES PLATOS NI PRECIOS):
${menuData}

IMPORTANTE: Los precios y platos de arriba son los ÚNICOS que existen. Si un plato no está en esa lista, NO lo menciones. Si un precio no está ahí, NO lo inventes. Cuando te pregunten cómo es un plato, usá SOLO la descripción que aparece entre paréntesis al lado del plato. NO inventes ingredientes ni descripciones. Si no tiene descripción, decí que consulten en el local.

ESTRATEGIAS DE VENTA:
- Si piden un segundo, sugerí una sopa de entrada
- Si piden comida, preguntá si quieren bebida
- Si no saben qué pedir, recomendá los más populares (Picante de Pollo, Silpancho, Sopa de Maní)
- Mencioná el Menú del Día si preguntan por algo económico
- Si es la primera vez, contales sobre la especialidad boliviana/andina`;
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function generateResponse(
  userMessage: string,
  menuData: string,
  conversationHistory: ConversationTurn[] = [],
): Promise<AIResponse> {
  const client = getClient();

  if (!client) {
    throw new Error('AI_API_KEY no configurada');
  }

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: buildSystemPrompt(menuData) },
  ];

  // Agregar historial de conversación
  for (const turn of conversationHistory) {
    messages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.text,
    });
  }

  // Agregar mensaje actual
  messages.push({ role: 'user', content: userMessage });

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  const responseText = (completion.choices[0]?.message?.content ?? '').trim();

  // Detectar si la IA indica handoff a humano
  if (responseText === 'HANDOFF_TO_HUMAN' || responseText.includes('HANDOFF_TO_HUMAN')) {
    return {
      text: 'Te comunico con nuestro equipo 🙌',
      handoffToHuman: true,
    };
  }

  return {
    text: responseText,
    handoffToHuman: false,
  };
}

export function isAIAvailable(): boolean {
  return !!config.aiApiKey;
}
