const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');

// --- MOTOR DE BASE DE DATOS (Sin dependencias externas inestables) ---
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');
global.db = low(adapter);

// Iniciamos la base de datos añadiendo el sector 'viewonce'
global.db.defaults({ users: {}, chats: {}, settings: {}, viewonce: {} }).write();

// Caché ultra-rápida en RAM
global.mediaCache = new Map();

// --- VERIFICACIÓN DE BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];
binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js')).map(f => require(path.join(pluginsDir, f)));

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version, 
        auth: state, 
        printQRInTerminal: false,
        browser: ['TheMystic-Bot-MD', 'Safari', '2.0.0'], 
        syncFullHistory: false
        // Hemos eliminado getMessage y makeInMemoryStore para evitar el crasheo radical
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            console.log('[INFO] Conexión cerrada. Reconectando...');
            iniciarBot();
        } else if (connection === 'open') {
            console.log(`[INFO] ¡Conectado! (${plugins.length} plugins cargados)`);
        }
    });

    const getMediaInfo = (msgObj) => {
        if (!msgObj) return null;
        if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
        if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
        if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        // --- INTERCEPTOR VIEW ONCE (Cero Crasheos) ---
        const msgId = msg.key.id;
        let isViewOnce = false;
        let content = msg.message;
        
        if (content?.ephemeralMessage) content = content.ephemeralMessage.message;
        const innerType = Object.keys(content || {})[0];
        
        if (innerType && innerType.includes('viewOnce')) {
            isViewOnce = true;
        }

        if (isViewOnce) {
            // Guardamos en RAM (rápido) y en Base de Datos (permanente)
            global.mediaCache.set(msgId, msg.message);
            if (!global.db.data.viewonce) global.db.data.viewonce = {};
            global.db.data.viewonce[msgId] = msg.message;
            global.db.write();
        }

        global.db.data = global.db.getState();

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        const ctx = { sock, msg, remitente, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted };

        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                    global.db.write();
                } catch (err) {
                    console.error(`Error en plugin ${plugin.name}:`, err);
                }
                break;
            }
        }
    });
}

iniciarBot();
