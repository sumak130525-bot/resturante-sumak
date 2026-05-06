import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { config } from './config';

// ── Types ─────────────────────────────────────────────────────────────────────

type SendMessageFn = (jid: string, content: { text: string }) => Promise<void>;

const READY_MESSAGE =
  '🎉 *¡Tu pedido está listo!*\n\nPasá a retirarlo por el local.\nTe esperamos en Juan B Alberdi 247, frente a la Terminal. 🌿';

let channel: RealtimeChannel | null = null;

// ── Phone number normalization ────────────────────────────────────────────────
// Baileys JID format: <number>@s.whatsapp.net (no + prefix, with country code)
// Input may be: "+5492617526242", "5492617526242", "2617526242", "549...", etc.
function normalizePhoneToJid(rawPhone: string): string {
  // Remove all non-digit characters (spaces, dashes, plus signs)
  const digits = rawPhone.replace(/\D/g, '');

  // If it's already a full international number (Argentina: starts with 549...)
  // Argentina mobile format: 549 + area_code + number = 5492617526242 (13 digits)
  // If it starts with 54 and is >= 12 digits, assume it's already correct
  if (digits.startsWith('54') && digits.length >= 12) {
    return `${digits}@s.whatsapp.net`;
  }

  // If it's a local Argentine number without country code (10 digits starting with area code)
  // e.g., "2617526242" -> add "549"
  if (digits.length === 10) {
    return `549${digits}@s.whatsapp.net`;
  }

  // Fallback: use as-is
  return `${digits}@s.whatsapp.net`;
}

// ── Start realtime subscription ───────────────────────────────────────────────

export function startKitchenNotifications(sendMessage: SendMessageFn): void {
  console.log('[Kitchen] Iniciando suscripción Realtime a pedidos de WhatsApp...');
  console.log('[Kitchen] Supabase URL:', config.supabase.url);

  const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  channel = supabase
    .channel('kitchen-orders')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: "channel=eq.whatsapp",
      },
      async (payload) => {
        console.log('[Kitchen] 🔔 UPDATE event recibido:', JSON.stringify(payload.new, null, 2));

        const newRecord = payload.new as {
          id: string;
          status: string;
          customer_phone: string | null;
          channel: string;
          customer_name: string | null;
        };

        const { id, status, customer_phone, customer_name } = newRecord;

        console.log(`[Kitchen] Pedido ${id} — status: "${status}", phone: "${customer_phone}", channel: "${newRecord.channel}"`);

        // Notify when order is ready or delivered
        if (status !== 'ready' && status !== 'delivered') {
          console.log(`[Kitchen] Status "${status}" no requiere notificación (esperando: "ready" o "delivered")`);
          return;
        }

        if (!customer_phone) {
          console.warn(`[Kitchen] ⚠️ Pedido ${id} no tiene customer_phone — no se puede notificar`);
          return;
        }

        try {
          const jid = normalizePhoneToJid(customer_phone);
          console.log(`[Kitchen] 📲 Enviando notificación a JID: ${jid} (phone raw: "${customer_phone}")`);
          await sendMessage(jid, { text: READY_MESSAGE });
          console.log(`[Kitchen] ✅ Notificación enviada a ${customer_name || customer_phone}: pedido ${status}`);
        } catch (err) {
          console.error(`[Kitchen] ❌ Error al notificar ${customer_phone}:`, err);
        }
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Kitchen] ✅ Realtime subscrito — escuchando cambios en pedidos de WhatsApp...');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Kitchen] ❌ Error en canal Realtime:', err);
      } else if (status === 'TIMED_OUT') {
        console.warn('[Kitchen] ⚠️ Realtime timeout — reintentando...');
      } else if (status === 'CLOSED') {
        console.warn('[Kitchen] ⚠️ Canal Realtime cerrado');
      } else {
        console.log('[Kitchen] Canal status:', status);
      }
    });

  console.log('[Kitchen] Canal Realtime configurado. Esperando suscripción...');
}

export function stopKitchenNotifications(): void {
  if (channel) {
    channel.unsubscribe();
    channel = null;
    console.log('[Kitchen] Suscripción Realtime detenida.');
  }
}
