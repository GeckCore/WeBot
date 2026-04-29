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
    settings: { grupos: true, autosticker: false },
    vigilancia: {} 
}).write();

// BLINDAJE DE MEMORIA: Carga inicial
global.db.data = global.db.getState();
console.log('[INFO] Base de datos JSON cargada y lista.');

// ==========================================
//      INICIALIZACIÓN GLOBAL CRÍTICA
// ==========================================
global.shadowTargets = {}; 
global.sniperTargets = {}; 
global.lastMsgTimestamps = {}; 
global.sesionesVigilia = {}; 
global.chatHistory = new Map(); // Memoria RAM para Gemini
global.plugins = [];

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

    // ==========================================
    //      CORE: PRESENCE (VIGILANCIA, SHADOW, SNIPER)
    // ==========================================
    sock.ev.on('presence.update', async ({ id, presences }) => {
        const target = id;
        const status = presences[target]?.lastKnownPresence;
        const ahora = Date.now();

        // 1. Vigilancia (Centinela)
        if (global.db.data?.vigilancia?.[target]) {
            if (status === 'available') {
                if (!global.sesionesVigilia[target]) {
                    global.sesionesVigilia[target] = ahora;
                    console.log(`[VIGILANCIA] ${target.split('@')[0]} ESTÁ EN LÍNEA.`);
                }
            } else if (status === 'unavailable') {
                const inicio = global.sesionesVigilia[target];
                if (inicio) {
                    const duracion = ahora - inicio;
                    if (duracion > 3000) { 
                        if (!global.db.data.vigilancia[target].logs) global.db.data.vigilancia[target].logs = [];
                        global.db.data.vigilancia[target].logs.push({ inicio, fin: ahora, duracion });
                        global.db.write();
                    }
                    delete global.sesionesVigilia[target];
                    console.log(`[VIGILANCIA] ${target.split('@')[0]} SE DESCONECTÓ. (${Math.floor(duracion/1000)}s)`);
                }
            }
        }

        // 2. Shadow (Mímica)
        if (global.shadowTargets[target]) {
            if (status === 'composing' || status === 'recording') {
                await sock.sendPresenceUpdate(status, target);
            } else {
                await sock.sendPresenceUpdate('paused', target);
            }
        }

        // 3. Sniper (Dime?)
        if (global.sniperTargets[target] && (status === 'composing' || status === 'recording')) {
            try {
                await new Promise(r => setTimeout(r, 700));
                await sock.sendMessage(target, { text: 'Dime?' });
                global.sniperTargets[target] = false; 
                setTimeout(() => { if (global.sniperTargets) global.sniperTargets[target] = true; }, 7000);
            } catch (e) {}
        }
    });

    // ==========================================
    //      CORE: RECEIPT TRACKER (VISTO)
    // ==========================================
    sock.ev.on('message-receipt.update', async (updates) => {
        for (const { key, receipt } of updates) {
            const remitente = key.remoteJid;
            if (global.shadowTargets[remitente] && receipt.readTimestamp && !key.fromMe) {
                const sendTime = global.lastMsgTimestamps[remitente];
                if (sendTime) {
                    const diff = receipt.readTimestamp - sendTime;
                    let tiempoTexto = diff < 60 ? `${diff} segundos` : `${Math.floor(diff / 60)} minutos y ${diff % 60} segundos`;
                    await sock.sendMessage(remitente, { text: `👁️ Tardaste ${tiempoTexto} en contestar.` });
                    delete global.lastMsgTimestamps[remitente];
                }
            }
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        
        if (connection === 'close') {
            iniciarBot();
        } else if (connection === 'open') {
            console.log(`[INFO] ¡Conectado! (${global.plugins.length} plugins cargados)`);
            
            // RE-SUSCRIPCIÓN DE VIGILANCIA
            const dataVigilancia = global.db.data?.vigilancia || {};
            const objetivos = Object.keys(dataVigilancia);
            for (const target of objetivos) {
                try {
                    await sock.presenceSubscribe(target);
                    console.log(`[CENTINELA] Re-suscrito a telemetría de: ${target.split('@')[0]}`);
                } catch (e) {}
            }
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
        
        let texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        let buttonText = "";
        try {
            if (msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                buttonText = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id || "";
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

        // --- SISTEMA DE MEMORIA PARA GEMINI ---
        if (textoLimpio && !textoLimpio.startsWith('.')) {
            if (!global.chatHistory.has(remitente)) {
                global.chatHistory.set(remitente, []);
            }
            const targetHistory = global.chatHistory.get(remitente);
            targetHistory.push({
                role: msg.key.fromMe ? 'model' : 'user',
                parts: [{ text: textoLimpio }]
            });
            if (targetHistory.length > 20) targetHistory.shift();
        }

        // --- REGISTRO DE TIEMPO (Shadow) ---
        if (msg.key.fromMe && global.shadowTargets[remitente]) {
            global.lastMsgTimestamps[remitente] = msg.messageTimestamp;
        }

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
