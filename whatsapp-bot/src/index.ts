import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';
import { handleMessage } from './handlers';
import { startKitchenNotifications } from './kitchen';

const logger = pino({ level: 'silent' });

const AUTH_DIR = path.resolve(__dirname, '../auth_info');

// ── Deduplication: avoid processing the same message twice ────────────────────
const processedMessages = new Set<string>();
const processedMsgIds = new Set<string>();
const MAX_PROCESSED = 1000;

function isDuplicate(sender: string, text: string, msgId?: string): boolean {
  // First: dedupe by message ID (catches LID/PN double delivery of same msg)
  if (msgId) {
    if (processedMsgIds.has(msgId)) return true;
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > MAX_PROCESSED) {
      const first = processedMsgIds.values().next().value;
      if (first) processedMsgIds.delete(first);
    }
  }

  // Second: dedupe by sender + text + 10-second window
  const timeSlot = Math.floor(Date.now() / 10000);
  const key = `${sender}:${text}:${timeSlot}`;
  if (processedMessages.has(key)) return true;
  processedMessages.add(key);
  if (processedMessages.size > MAX_PROCESSED) {
    const first = processedMessages.values().next().value;
    if (first) processedMessages.delete(first);
  }
  return false;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log('\n🌿 ===================================');
  console.log('   SUMAK WHATSAPP BOT');
  console.log('   Restaurante Sumak - Mendoza');
  console.log('🌿 ===================================\n');

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['Sumak Bot', 'Chrome', '1.0.0'],
  });

  // ── Guardar credenciales cuando se actualicen ──────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Manejo de conexión ─────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 Escanea este QR con WhatsApp para conectar el bot:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n⚠️  Tenés 60 segundos para escanear el código.\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (statusCode === 515) {
        // 515 = restart required (normal durante handshake post-QR). Reconectar SIN borrar auth_info.
        console.log('🔄 Error 515: reinicio requerido (normal post-QR). Reconectando en 5s...');
        setTimeout(startBot, 5000);
      } else if (statusCode === 440) {
        console.log('⚠️ Error 440: sesión corrupta. Limpiando auth_info y reconectando en 10s...');
        const fs = await import('fs');
        const path = await import('path');
        const authDir = path.join(__dirname, '..', 'auth_info');
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
          console.log('🗑️ auth_info eliminada');
        }
        setTimeout(startBot, 10000);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada. Eliminá la carpeta auth_info y reiniciá el bot para volver a escanear el QR.');
        process.exit(1);
      } else {
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log(`🔄 Reconectando... (código: ${statusCode})`);
          setTimeout(startBot, 5000);
        }
      }
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || 'desconocido';
      console.log(`✅ Bot conectado exitosamente!`);
      console.log(`📞 Número: +${phone}`);
      console.log(`🤖 Sumak Bot está listo para recibir mensajes.\n`);

      // Start kitchen order notifications via Supabase Realtime
      startKitchenNotifications((jid, content) => sock.sendMessage(jid, content).then(() => {}));
    }
  });

  // ── Manejo de mensajes entrantes ───────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensajes propios o de grupos (por ahora)
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;
      if (!msg.message) continue;

      // Debug: log full msg.key to inspect available fields
      console.log('MSG KEY:', JSON.stringify(msg.key));

      const jid = msg.key.remoteJid!;
      const isLid = jid.endsWith('@lid');

      // Resolve real phone number when Baileys returns a LID JID
      let realPhone: string;
      let realJid: string;

      if (isLid) {
        // senderPn is the real phone number provided by Baileys for LID mappings
        const pn = (msg.key as any).senderPn as string | undefined;
        if (pn) {
          realPhone = pn.split('@')[0].split(':')[0];
          realJid = `${realPhone}@s.whatsapp.net`;
          console.log(`[LID] Resolved LID ${jid} → ${realJid} via senderPn`);
        } else {
          // Cannot resolve LID — skip this message (it will arrive again as normal JID)
          console.warn(`[LID] ⚠️ Could not resolve LID ${jid} — skipping (will arrive via normal JID)`);
          continue;
        }
      } else {
        realPhone = jid.split('@')[0];
        realJid = jid;
      }

      const sender = realPhone;

      // Extraer texto del mensaje
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.buttonsResponseMessage?.selectedDisplayText ||
        msg.message.listResponseMessage?.title ||
        '';

      if (!text || text.trim() === '') continue;

      // Dedup by msg ID + sender + text (catches LID/PN double delivery)
      if (isDuplicate(sender, text.trim(), msg.key.id ?? undefined)) {
        console.log(`⏭️  Mensaje duplicado ignorado de +${sender}: "${text}"`);
        continue;
      }

      console.log(`📩 Mensaje de +${sender}: "${text}"`);

      try {
        // Indicador de "escribiendo..."
        await sock.sendPresenceUpdate('composing', realJid);

        const response = await handleMessage(text, sender);

        // Pequeña pausa para simular escritura natural
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 800));

        await sock.sendMessage(realJid, { text: response });
        console.log(`✉️  Respuesta enviada a +${sender}`);
      } catch (err) {
        console.error(`❌ Error al responder a +${sender}:`, err);

        // Respuesta de emergencia
        try {
          await sock.sendMessage(realJid, {
            text:
              '¡Hola! 👋 En este momento tengo un problema técnico. ' +
              `Para ayudarte, contactanos directamente:\n📞 +${config.restaurant.phone}\n🌐 ${config.restaurant.web}\n\n_Sumak Bot 🤖_`,
          });
        } catch {
          // silencioso
        }
      }
    }
  });
}

// ── Importar config para el mensaje de emergencia ─────────────────────────────
import { config } from './config';

// ── Inicio ────────────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('❌ Error fatal al iniciar el bot:', err);
  process.exit(1);
});
