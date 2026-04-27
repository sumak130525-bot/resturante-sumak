import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { config } from './config';

// ── Cliente Gemini (lazy init para no fallar si no hay API key) ───────────────
let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
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
- Horario: Lunes a Sábado 8:00 a 20:00
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
9. NUNCA inventes platos o precios que no estén en el menú
10. NUNCA des información falsa sobre horarios, ubicación, etc.
11. Podés responder en inglés o quechua si el cliente escribe en esos idiomas
12. Firmá como Sumak Bot 🤖 solo en el primer mensaje de bienvenida, después no

MENÚ ACTUAL (se actualiza automáticamente):
${menuData}

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
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: buildSystemPrompt(menuData),
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    ],
  });

  // Convertir historial al formato de Gemini
  const history = conversationHistory.map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const chat = model.startChat({ history });

  const result = await chat.sendMessage(userMessage);
  const responseText = result.response.text().trim();

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
  return !!config.geminiApiKey;
}
