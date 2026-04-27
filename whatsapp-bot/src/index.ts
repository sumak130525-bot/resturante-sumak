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

const logger = pino({ level: 'silent' });

const AUTH_DIR = path.resolve(__dirname, '../auth_info');

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
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`🔄 Reconectando... (código: ${statusCode})`);
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Sesión cerrada. Eliminá la carpeta auth_info y reiniciá el bot para volver a escanear el QR.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0] || 'desconocido';
      console.log(`✅ Bot conectado exitosamente!`);
      console.log(`📞 Número: +${phone}`);
      console.log(`🤖 Sumak Bot está listo para recibir mensajes.\n`);
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

      const jid = msg.key.remoteJid!;
      const sender = jid.split('@')[0];

      // Extraer texto del mensaje
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.buttonsResponseMessage?.selectedDisplayText ||
        msg.message.listResponseMessage?.title ||
        '';

      if (!text || text.trim() === '') continue;

      console.log(`📩 Mensaje de +${sender}: "${text}"`);

      try {
        // Indicador de "escribiendo..."
        await sock.sendPresenceUpdate('composing', jid);

        const response = await handleMessage(text, sender);

        // Pequeña pausa para simular escritura natural
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 800));

        await sock.sendMessage(jid, { text: response });
        console.log(`✉️  Respuesta enviada a +${sender}`);
      } catch (err) {
        console.error(`❌ Error al responder a +${sender}:`, err);

        // Respuesta de emergencia
        try {
          await sock.sendMessage(jid, {
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
