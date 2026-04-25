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

// Variables de estado global para funciones especiales
global.sniperTargets = {}; 
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
        } catch (e) {
            console.error(`[ERROR] No se pudo dar permisos a ${fileName}`);
        }
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
    //       CORE: LISTENER DE PRESENCIA (SNIPER)
    // ==========================================
    sock.ev.on('presence.update', async ({ id, presences }) => {
        const target = id;
        const status = presences[target]?.lastKnownPresence;

        // Si el objetivo está marcado y empieza a escribir
        if (global.sniperTargets && global.sniperTargets[target] && status === 'composing') {
            try {
                await new Promise(r => setTimeout(r, 600)); // Delay para naturalidad
                
                const balas = ["?", ".", "👁️", "Dime", "Escribiendo..."];
                const shot = balas[Math.floor(Math.random() * balas.length)];
                
                await sock.sendMessage(target, { text: shot });

                // Cooldown de 5 segundos para evitar baneo por spam automático
                global.sniperTargets[target] = false; 
                setTimeout(() => { 
                    if (global.sniperTargets) global.sniperTargets[target] = true; 
                }, 5000);
            } catch (e) {
                console.error("Error en Typing Sniper Shot:", e);
            }
        }
    });

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
        if (msgObj.stickerMessage) return { type: 'sticker', msg: msgObj.stickerMessage, ext: 'webp' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const remitente = msg.key.remoteJid;
        
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
        // Se añade stickerMessage a la lista de detección
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType && !buttonText) return;

        const isGroup = remitente.endsWith('@g.us');
        const settings = global.db.data.settings;

        if (isGroup && settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) return;

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
