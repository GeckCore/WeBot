const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const lodash = require('lodash');

// --- MOTOR DE BASE DE DATOS (lowdb@1.0.0) ---
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');
global.db = low(adapter);

// Inicialización con el ajuste de grupos por defecto en true (on)
global.db.defaults({ 
    users: {}, 
    chats: {}, 
    settings: { grupos: true } 
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

// Variable global para los plugins
let plugins = [];

async function iniciarBot() {
    // --- CARGA DINÁMICA DE PLUGINS (Soporte para ESM y Top-level await) ---
    const pluginsDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    
    const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    
    plugins = await Promise.all(pluginFiles.map(async (file) => {
        try {
            const fullPath = path.join(pluginsDir, file);
            const module = await import(pathToFileURL(fullPath).href);
            return module.default || module;
        } catch (err) {
            console.error(`❌ Error cargando plugin ${file}:`, err.message);
            return null;
        }
    }));
    plugins = plugins.filter(p => p !== null);

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    
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

        global.db.data = global.db.getState();

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType) return;

        // --- LÓGICA DE CONTROL DE GRUPOS ---
        const isGroup = remitente.endsWith('@g.us');
        const settings = global.db.data.settings;

        // Si es un grupo y el bot está en 'off', ignoramos todo excepto el comando para encenderlo
        if (isGroup && settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) {
            return;
        }

        // --- SISTEMA DE MEMORIA PARA IA (Últimos 25 mensajes) ---
        if (!global.chatHistory) global.chatHistory = new Map();
        if (!global.chatHistory.has(remitente)) global.chatHistory.set(remitente, []);
        
        const history = global.chatHistory.get(remitente);
        // Guardamos quién lo envió y qué dijo
        history.push({ 
            role: msg.key.fromMe ? 'model' : 'user', 
            parts: [{ text: textoLimpio || `[Envió: ${msgType}]` }] 
        });
        // Mantenemos solo los últimos 25
        if (history.length > 25) history.shift();
        // --------------------------------------------------------

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
            if (plugin.match && plugin.match(textoLimpio, ctx)) {
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
