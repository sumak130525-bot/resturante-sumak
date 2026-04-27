import { ConversationTurn } from './ai';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ConversationSession {
  messages: ConversationTurn[];
  lastActive: Date;
}

// ── Constantes ─────────────────────────────────────────────────────────────────
const MAX_HISTORY = 10;               // Máximo de turnos por conversación
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos de inactividad

// ── Estado ─────────────────────────────────────────────────────────────────────
const sessions = new Map<string, ConversationSession>();

// ── Limpieza periódica de sesiones inactivas ──────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions.entries()) {
    if (now - session.lastActive.getTime() > SESSION_TTL_MS) {
      sessions.delete(phone);
    }
  }
}, 5 * 60 * 1000); // Revisar cada 5 minutos

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Devuelve el historial de conversación de un número (sin el mensaje actual).
 */
export function getHistory(phone: string): ConversationTurn[] {
  const session = sessions.get(phone);
  if (!session) return [];
  return [...session.messages];
}

/**
 * Agrega un turno de usuario y uno de asistente al historial.
 * Mantiene máximo MAX_HISTORY turnos (cada turno = user + assistant = 2 mensajes).
 */
export function addTurn(phone: string, userMessage: string, assistantMessage: string): void {
  let session = sessions.get(phone);

  if (!session) {
    session = { messages: [], lastActive: new Date() };
    sessions.set(phone, session);
  }

  session.messages.push({ role: 'user', text: userMessage });
  session.messages.push({ role: 'assistant', text: assistantMessage });
  session.lastActive = new Date();

  // Mantener solo los últimos MAX_HISTORY mensajes (pares user/assistant)
  if (session.messages.length > MAX_HISTORY * 2) {
    session.messages = session.messages.slice(-MAX_HISTORY * 2);
  }
}

/**
 * Limpia la sesión de un número (útil después de handoff a humano).
 */
export function clearSession(phone: string): void {
  sessions.delete(phone);
}

/**
 * Cuenta sesiones activas (para debug/monitoreo).
 */
export function getActiveSessionCount(): number {
  return sessions.size;
}
