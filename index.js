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

// ==========================================
//      INICIALIZACIÓN GLOBAL CRÍTICA
// ==========================================
global.shadowTargets = {}; 
global.sniperTargets = {}; 
global.lastMsgTimestamps = {}; // Almacena cuándo enviaste tú el mensaje
global.plugins = [];

// --- OPTIMIZACIÓN DE ARRANQUE: BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg', 'webpmux']; 

binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { 
            fs.chmodSync(binPath, '755'); 
        } catch (e) {}
    }
});

async function iniciarBot() {
    // --- CARGA DINÁMICA DE PLUGINS ---
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

    // ==========================================
    //      CORE: PRESENCE (SHADOW & SNIPER)
    // ==========================================
    sock.ev.on('presence.update', async ({ id, presences }) => {
        const target = id;
        const status = presences[target]?.lastKnownPresence;

        // 1. Lógica Shadow (Mímica de escritura/audio)
        if (global.shadowTargets[target]) {
            if (status === 'composing' || status === 'recording') {
                await sock.sendPresenceUpdate(status, target);
            } else {
                await sock.sendPresenceUpdate('paused', target);
            }
        }

        // 2. Lógica Sniper (Dime?)
        if (global.sniperTargets[target] && (status === 'composing' || status === 'recording')) {
            try {
                await new Promise(r => setTimeout(r, 700));
                await sock.sendMessage(target, { text: 'Dime?' });

                global.sniperTargets[target] = false; 
                setTimeout(() => { 
                    if (global.sniperTargets) global.sniperTargets[target] = true; 
                }, 7000);
            } catch (e) {
                console.error("Error en Sniper Shot:", e);
            }
        }
    });

    // ==========================================
    //      CORE: RECEIPT TRACKER (VISTO)
    // ==========================================
    sock.ev.on('message-receipt.update', async (updates) => {
        for (const { key, receipt } of updates) {
            const remitente = key.remoteJid;
            
            // Si el modo shadow está activo y el mensaje ha sido LEÍDO (doble check azul)
            if (global.shadowTargets[remitente] && receipt.readTimestamp && !key.fromMe) {
                const sendTime = global.lastMsgTimestamps[remitente];
                
                if (sendTime) {
                    // Diferencia real entre el envío y la lectura
                    const diff = receipt.readTimestamp - sendTime;
                    const segundos = diff; 
                    
                    let tiempoTexto = segundos < 60 
                        ? `${segundos} segundos` 
                        : `${Math.floor(segundos / 60)} minutos y ${segundos % 60} segundos`;

                    await sock.sendMessage(remitente, { 
                        text: `👁️ Tardaste ${tiempoTexto} en contestar.` 
                    });
                    
                    // Limpiar el registro para no repetir por el mismo mensaje
                    delete global.lastMsgTimestamps[remitente];
                }
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
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
        if (msgObj.stickerMessage) return { type: 'sticker', msg: msgObj.stickerMessage, ext: 'webp' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const remitente = msg.key.remoteJid;
        
        // --- REGISTRO DE TIEMPO (Solo para Shadow activo) ---
        if (msg.key.fromMe && global.shadowTargets[remitente]) {
            global.lastMsgTimestamps[remitente] = msg.messageTimestamp;
        }

        let texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
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
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType && !buttonText) return;

        const isGroup = remitente.endsWith('@g.us');
        const settings = global.db.data.settings;

        if (isGroup && settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) return;

        const ctx = { sock, msg, remitente, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted, msgType };

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
