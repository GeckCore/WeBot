const baileysModule = require('@whiskeysockets/baileys');

// --- EXTRACCIÓN DE FUNCIONES BAILEYS ---
const findBaileysFunction = (name) => {
    const search = (obj, target, depth = 0) => {
        if (!obj || depth > 3) return undefined;
        if (typeof obj[target] === 'function') return obj[target];
        if (obj.default) return search(obj.default, target, depth + 1);
        return undefined;
    };
    return search(baileysModule, name);
};

const makeWASocket = findBaileysFunction('makeWASocket') || baileysModule.default;
const useMultiFileAuthState = findBaileysFunction('useMultiFileAuthState');
const fetchLatestBaileysVersion = findBaileysFunction('fetchLatestBaileysVersion');
const downloadContentFromMessage = findBaileysFunction('downloadContentFromMessage');
const jidNormalizedUser = findBaileysFunction('jidNormalizedUser');
const extractMessageContent = findBaileysFunction('extractMessageContent');
const { proto, isJidBroadcast } = baileysModule;

const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const lodash = require('lodash');

// --- BASE DE DATOS (LowDB) ---
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');
global.db = low(adapter);
global.db.defaults({ users: {}, chats: {}, settings: {} }).write();

// --- CACHÉ DE MEDIOS (Solución al error .get) ---
// Definimos global.mediaCache para que los plugins que lo usan no den error
global.mediaCache = new Map();

// --- IMPLEMENTACIÓN DEL STORE (Basada en tu código) ---
function customInMemoryStore() {
    let messages = {};
    let chats = {};

    function loadMessage(jid, id = null) {
        let message = null;
        if (jid && !id) {
            id = jid;
            const filter = m => m.key?.id == id;
            const messageFind = Object.entries(messages).find(([, msgs]) => msgs.find(filter));
            message = messageFind?.[1]?.find(filter);
        } else {
            jid = jidNormalizedUser(jid);
            if (!(jid in messages)) return null;
            message = messages[jid]?.find(m => m.key.id == id);
        }
        return message || null;
    }

    function upsertMessage(jid, message, type = 'append') {
        jid = jidNormalizedUser(jid);
        if (!(jid in messages)) messages[jid] = [];
        
        // Guardamos en la caché rápida para el comando .read/.ver
        global.mediaCache.set(message.key.id, message);
        
        // Limpieza de metadatos pesados para optimizar RAM
        if (message.message) {
            delete message.message.messageContextInfo;
            delete message.message.senderKeyDistributionMessage;
        }

        const msg = loadMessage(jid, message.key.id);
        if (msg) {
            Object.assign(msg, message);
        } else {
            if (type === 'append') messages[jid].push(message);
            else messages[jid].unshift(message);
        }
        
        // Limitar a 500 mensajes por chat para un uso personal fluido
        if (messages[jid].length > 500) messages[jid].shift();
        
        // Auto-limpieza de la caché rápida cada hora para no saturar la RAM
        if (global.mediaCache.size > 2000) {
            const keys = Array.from(global.mediaCache.keys());
            for (let i = 0; i < 500; i++) global.mediaCache.delete(keys[i]);
        }
    }

    function bind(conn) {
        conn.ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            if (['append', 'notify'].includes(type)) {
                for (const msg of newMessages) {
                    const jid = jidNormalizedUser(msg.key.remoteJid);
                    if (!jid || isJidBroadcast(jid)) continue;
                    upsertMessage(jid, msg, type);
                }
            }
        });
        
        conn.ev.on('messages.update', updates => {
            for (const { key, update } of updates) {
                const jid = jidNormalizedUser(key.remoteJid);
                const message = loadMessage(jid, key.id);
                if (message) Object.assign(message, update);
            }
        });
    }

    return { bind, loadMessage, messages, chats };
}

global.store = customInMemoryStore();

// --- GESTIÓN DE BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];
binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

// --- CARGA DE PLUGINS ---
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => {
        try { return require(path.join(pluginsDir, f)); }
        catch (e) { console.error(`[ERROR] Plugin ${f}:`, e.message); return null; }
    }).filter(p => p !== null);

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['TheMystic-Bot', 'Chrome', '122.0.0.0'],
        syncFullHistory: false,
        getMessage: async (key) => {
            return global.store.loadMessage(key.remoteJid, key.id)?.message || undefined;
        }
    });

    // Vinculamos nuestro Store manual
    global.store.bind(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') iniciarBot();
        else if (connection === 'open') console.log(`[INFO] Bot Online (${plugins.length} plugins).`);
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const remitente = msg.key.remoteJid;
        
        // Extraemos contenido ignorando capas de efímero/viewonce para detectar el comando
        const messageContent = extractMessageContent(msg.message);
        const texto = messageContent?.conversation || 
                      messageContent?.extendedTextMessage?.text || 
                      messageContent?.imageMessage?.caption || 
                      messageContent?.videoMessage?.caption || "";
        
        const textoLimpio = texto.trim();
        const quoted = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Contexto para plugins
        const ctx = { 
            sock, 
            msg, 
            remitente, 
            textoLimpio, 
            downloadContentFromMessage, 
            extractMessageContent,
            quoted 
        };

        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                    global.db.write();
                } catch (err) {
                    console.error(`Error en plugin [${plugin.name}]:`, err);
                }
                break;
            }
        }
    });
}

iniciarBot();
