import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { config } from './config';

// ── Types ─────────────────────────────────────────────────────────────────────

type SendMessageFn = (jid: string, content: { text: string }) => Promise<void>;

const READY_MESSAGE =
  '🎉 *¡Tu pedido está listo!*\n\nPasá a retirarlo por el local.\nTe esperamos en Juan B Alberdi 247, frente a la Terminal. 🌿';

let channel: RealtimeChannel | null = null;

// ── Start realtime subscription ───────────────────────────────────────────────

export function startKitchenNotifications(sendMessage: SendMessageFn): void {
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
        const newRecord = payload.new as {
          id: string;
          status: string;
          customer_phone: string | null;
          channel: string;
          customer_name: string | null;
        };

        const { status, customer_phone, customer_name } = newRecord;

        // Notify when order is ready or delivered
        if (status !== 'ready' && status !== 'delivered') return;
        if (!customer_phone) return;

        try {
          // Baileys JID format: 549XXXXXXXXXX@s.whatsapp.net
          const jid = `${customer_phone}@s.whatsapp.net`;
          await sendMessage(jid, { text: READY_MESSAGE });
          console.log(`📲 Notificación enviada a ${customer_name || customer_phone}: pedido listo`);
        } catch (err) {
          console.error(`❌ Error al notificar ${customer_phone}:`, err);
        }
      },
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('🔔 Kitchen notifications: escuchando cambios en pedidos de WhatsApp...');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Kitchen notifications: error en canal Realtime');
      }
    });
}

export function stopKitchenNotifications(): void {
  if (channel) {
    channel.unsubscribe();
    channel = null;
  }
}
