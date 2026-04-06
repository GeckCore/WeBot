const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');

// --- MOTOR DE BASE DE DATOS (Sintaxis Correcta para lowdb@1.0.0) ---
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');

// Inicializamos la base de datos de forma síncrona (como requiere v1.0.0)
global.db = low(adapter);

// Establecemos los valores por defecto si el archivo está vacío
global.db.defaults({ 
    users: {}, 
    chats: {}, 
    settings: {} 
}).write();

console.log('[INFO] Base de datos JSON cargada y lista.');

// --- OPTIMIZACIÓN DE ARRANQUE: BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];

binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

// Cargar plugins dinámicamente
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(pluginsDir, file)));

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state, 
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '122.0.0.0'], 
        syncFullHistory: false
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
        if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        // En lowdb v1, el acceso a datos es directo a través de .getState()
        // o simplemente configurando global.db.data para compatibilidad con tus plugins
        global.db.data = global.db.getState();

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        const ctx = { 
            sock, 
            msg, 
            remitente, 
            textoLimpio, 
            getMediaInfo, 
            downloadContentFromMessage, 
            quoted, 
            msgType 
        };

        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                    // Guardamos los cambios en el archivo tras ejecutar un comando
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
