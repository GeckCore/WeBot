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

global.db.defaults({ 
    users: {}, 
    chats: {}, 
    settings: { grupos: true, autosticker: false } 
}).write();

console.log('[INFO] Base de datos JSON cargada y lista.');

global.espejosActivos = {}; 
global.plugins = [];

// --- OPTIMIZACIÓN DE ARRANQUE: BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg', 'webpmux']; 

binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

async function iniciarBot() {
    const pluginsDir = path.join(__dirname, 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    
    const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    
    global.plugins = await Promise.all(pluginFiles.map(async (file) => {
        try {
            const fullPath = path.join(pluginsDir, file);
            const module = await import(pathToFileURL(fullPath).href);
            return module.default || module;
        } catch (err) {
            console.error(`❌ Error cargando plugin ${file}:`, err.message);
            return null;
        }
    }));
    global.plugins = global.plugins.filter(p => p !== null);

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
            console.log(`[INFO] ¡Conectado! (${global.plugins.length} plugins cargados)`);
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

        let texto = msg.message.conversation 
            || msg.message.extendedTextMessage?.text 
            || "";
        
        let buttonText = "";
        try {
            if (msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                buttonText = params.id || "";
            }
        } catch (e) {}
        
        if (!buttonText) {
            buttonText = msg?.message?.buttonsResponseMessage?.selectedButtonId 
                || msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId
                || msg?.message?.templateButtonReplyMessage?.selectedId
                || "";
        }
        if (buttonText) texto = buttonText;
        const textoLimpio = texto.trim();

        // ==========================================
        // SEGURO ANTI-BUCLE (FILTRO DE ORIGEN)
        // Si el mensaje lo enviaste tú y NO es un comando, lo ignora.
        // Esto corta el bucle infinito del clon.
        // ==========================================
        if (msg.key.fromMe && !textoLimpio.startsWith('.')) return;

        global.db.data = global.db.getState();
        const remitente = msg.key.remoteJid;
        
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType && !buttonText) return;

        const isGroup = remitente.endsWith('@g.us');
        const settings = global.db.data.settings;

        if (isGroup && settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) return;

        const ctx = { 
            sock, msg, remitente, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted, msgType 
        };

        for (const plugin of global.plugins) {
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
