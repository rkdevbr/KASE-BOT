// ============================================================
// KASE BOT — versão inicial para testes no Render
// WhatsApp: Baileys | Servidor HTTP: Express
// ============================================================

const express = require('express');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_DIR = process.env.AUTH_DIR || './sessao';
const PREFIX = process.env.PREFIX || '.';
const PAIRING_NUMBER = (process.env.PAIRING_NUMBER || '').replace(/\D/g, '');

let reconnectTimer = null;
let reconnectDelay = 5000;
let starting = false;
let currentSocket = null;

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'KASE BOT',
    status: 'online',
    whatsapp: currentSocket ? 'socket iniciado' : 'aguardando inicialização'
  });
});

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KASE BOT HTTP ativo na porta ${PORT}`);
});

function menuText() {
  return [
    '*KASE ESPORTS — KASE BOT*',
    '',
    '*COMANDOS GERAIS*',
    `${PREFIX}menu — mostrar este menu`,
    `${PREFIX}regras — regras do grupo`,
    `${PREFIX}adm — listar administradores`,
    `${PREFIX}infogrupo — informações do grupo`,
    '',
    'Mais comandos serão adicionados nas próximas versões.'
  ].join('\n');
}

async function handleMessage(sock, message) {
  if (!message.message || message.key.fromMe) return;

  const jid = message.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return;

  const messageType = Object.keys(message.message)[0];
  const rawText =
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    message.message.imageMessage?.caption ||
    message.message.videoMessage?.caption ||
    '';

  const text = rawText.trim();
  if (!text.startsWith(PREFIX)) return;

  const [command] = text.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = (command || '').toLowerCase();

  try {
    if (cmd === 'menu') {
      await sock.sendMessage(jid, { text: menuText() }, { quoted: message });
      return;
    }

    if (cmd === 'regras') {
      await sock.sendMessage(jid, {
        text: '*REGRAS — KASE ESPORTS*\n\n1. Respeite todos os membros.\n2. Não faça spam ou divulgação sem autorização.\n3. Não envie conteúdo ofensivo ou discriminatório.\n4. Siga as orientações da administração.'
      }, { quoted: message });
      return;
    }

    if (cmd === 'infogrupo') {
      if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: 'Esse comando funciona dentro de grupos.' }, { quoted: message });
        return;
      }
      const metadata = await sock.groupMetadata(jid);
      await sock.sendMessage(jid, {
        text: `*INFORMAÇÕES DO GRUPO*\n\nNome: ${metadata.subject}\nMembros: ${metadata.participants.length}\nID: ${jid}`
      }, { quoted: message });
      return;
    }

    if (cmd === 'adm') {
      if (!jid.endsWith('@g.us')) {
        await sock.sendMessage(jid, { text: 'Esse comando funciona dentro de grupos.' }, { quoted: message });
        return;
      }
      const metadata = await sock.groupMetadata(jid);
      const admins = metadata.participants.filter(p => p.admin);
      const mentions = admins.map(p => p.id);
      const lines = admins.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`);
      await sock.sendMessage(jid, {
        text: lines.length ? `*ADMINISTRADORES DO GRUPO*\n\n${lines.join('\n')}` : 'Nenhum administrador encontrado.',
        mentions
      }, { quoted: message });
      return;
    }
  } catch (error) {
    console.error(`Erro no comando ${cmd}:`, error.message);
    await sock.sendMessage(jid, {
      text: 'Não consegui executar esse comando. Verifique as permissões do bot e tente novamente.'
    }).catch(() => {});
  }
}

async function startWhatsApp() {
  if (starting) return;
  starting = true;

  try {
    fs.mkdirSync(path.resolve(AUTH_DIR), { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: process.env.LOG_LEVEL || 'warn' }),
      browser: Browsers.macOS('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    currentSocket = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages) {
        await handleMessage(sock, message);
      }
    });

    let pairingRequested = false;
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (connection === 'connecting') {
        console.log('Conectando ao WhatsApp...');
      }

      // O código de pareamento é solicitado apenas se a sessão ainda não estiver vinculada.
      if (qr && !state.creds.registered && PAIRING_NUMBER && !pairingRequested) {
        pairingRequested = true;
        try {
          const code = await sock.requestPairingCode(PAIRING_NUMBER);
          console.log('Código de vinculação do WhatsApp:', code);
          console.log('No celular: WhatsApp > Dispositivos conectados > Conectar dispositivo > Conectar com número de telefone.');
        } catch (error) {
          pairingRequested = false;
          console.error('Não foi possível solicitar o código de vinculação:', error.message);
        }
      } else if (qr && !state.creds.registered && !PAIRING_NUMBER) {
        console.log('Sessão ainda não vinculada. Configure PAIRING_NUMBER nas variáveis de ambiente.');
      }

      if (connection === 'open') {
        reconnectDelay = 5000;
        console.log('KASE BOT conectado ao WhatsApp!');
      }

      if (connection === 'close') {
        currentSocket = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('Conexão WhatsApp encerrada. Código:', statusCode || 'desconhecido');

        if (statusCode === DisconnectReason.loggedOut) {
          console.error('A sessão foi desconectada pelo WhatsApp. Será necessário vincular novamente.');
          return;
        }

        if (!reconnectTimer) {
          const delay = reconnectDelay;
          console.log(`Nova tentativa em ${Math.round(delay / 1000)} segundos...`);
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            starting = false;
            startWhatsApp().catch(err => console.error('Falha ao reconectar:', err));
          }, delay);
          reconnectDelay = Math.min(reconnectDelay * 2, 60000);
        }
      }
    });
  } catch (error) {
    console.error('Erro ao iniciar o WhatsApp:', error);
    starting = false;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startWhatsApp().catch(err => console.error('Falha ao reiniciar:', err));
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    }
  }
}

startWhatsApp().catch(error => {
  console.error('Falha fatal ao iniciar KASE BOT:', error);
  process.exitCode = 1;
});

process.on('SIGTERM', () => {
  console.log('Encerrando KASE BOT...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit(0);
});
