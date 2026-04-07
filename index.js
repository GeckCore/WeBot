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

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ PERSISTENTE DE MENSAJES (CORREGIDO PARA BUFFERS)
// ─────────────────────────────────────────────────────────────────────────────
const MSG_STORE_FILE = path.join(__dirname, 'mediaMessageStore.json');
const MSG_STORE_LIMIT = 1500;
let _msgStoreDirty = false;
let _msgStoreSaveTimer = null;

function loadPersistentMsgStore() {
    try {
        if (fs.existsSync(MSG_STORE_FILE)) {
            const raw = fs.readFileSync(MSG_STORE_FILE, 'utf8');
            // FIX: Revivir los Buffers destruidos por el JSON.stringify
            const reviver = (k, v) => {
                if (v && v.type === 'Buffer' && Array.isArray(v.data)) {
                    return Buffer.from(v.data);
                }
                return v;
            };
            const entries = JSON.parse(raw, reviver);
            for (const { id, msg } of entries) {
                if (id && msg) global.mediaCache.set(id, msg);
            }
            console.log(`[STORE] ✅ ${global.mediaCache.size} mensajes cargados desde disco con llaves intactas.`);
        }
    } catch (e) {
        console.error('[STORE] ❌ No se pudo cargar mediaMessageStore.json:', e.message);
    }
}

function scheduleMsgStoreSave() {
    _msgStoreDirty = true;
    if (_msgStoreSaveTimer) return;
    _msgStoreSaveTimer = setTimeout(() => {
        _msgStoreSaveTimer = null;
        if (!_msgStoreDirty) return;
        try {
            const entries = [];
            for (const [id, msg] of global.mediaCache.entries()) {
                entries.push({ id, msg });
            }
            fs.writeFileSync(MSG_STORE_FILE, JSON.stringify(entries));
            _msgStoreDirty = false;
        } catch (e) {
            console.error('[STORE] ❌ Error guardando mediaMessageStore.json:', e.message);
        }
    }, 5000);
}

global.mediaCache = new Map();
loadPersistentMsgStore();

// ─────────────────────────────────────────────────────────────────────────────
// IMPLEMENTACIÓN DEL STORE EN MEMORIA
// ─────────────────────────────────────────────────────────────────────────────
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
            const normalJid = jidNormalizedUser(jid);
            if (!(normalJid in messages)) return null;
            message = messages[normalJid]?.find(m => m.key.id == id);
        }
        return message || null;
    }

    function upsertMessage(jid, message, type = 'append') {
        const normalJid = jidNormalizedUser(jid);
        if (!(normalJid in messages)) messages[normalJid] = [];

        const msgId = message.key?.id;
        if (msgId) {
            // FIX CRÍTICO: cloneDeep separa la copia en RAM del objeto procesado por Baileys.
            // Si WhatsApp purga el mensaje original, nuestra RAM no se ve afectada.
            global.mediaCache.set(msgId, lodash.cloneDeep(message));

            if (global.mediaCache.size > 2000) {
                const keys = Array.from(global.mediaCache.keys());
                for (let i = 0; i < 500; i++) global.mediaCache.delete(keys[i]);
            }

            scheduleMsgStoreSave();

            if (global.mediaCache.size > MSG_STORE_LIMIT) {
                const oldest = Array.from(global.mediaCache.keys()).slice(0, global.mediaCache.size - MSG_STORE_LIMIT);
                for (const k of oldest) global.mediaCache.delete(k);
            }
        }

        if (message.message) {
            delete message.message.messageContextInfo;
            delete message.message.senderKeyDistributionMessage;
        }

        const existing = loadMessage(normalJid, msgId);
        if (existing) {
            Object.assign(existing, message);
        } else {
            if (type === 'append') messages[normalJid].push(message);
            else messages[normalJid].unshift(message);
        }

        if (messages[normalJid].length > 500) messages[normalJid].shift();
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

// ─────────────────────────────────────────────────────────────────────────────
// GESTIÓN DE BINARIOS
// ─────────────────────────────────────────────────────────────────────────────
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];
binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath) && !isWindows) {
        try { fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CARGA DE PLUGINS
// ─────────────────────────────────────────────────────────────────────────────
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => {
        try { return require(path.join(pluginsDir, f)); }
        catch (e) { console.error(`[ERROR] Plugin ${f}:`, e.message); return null; }
    }).filter(p => p !== null);

// ─────────────────────────────────────────────────────────────────────────────
// INICIO DEL BOT
// ─────────────────────────────────────────────────────────────────────────────
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
            const cached = global.mediaCache.get(key.id);
            if (cached?.message) return cached.message;
            return global.store.loadMessage(key.remoteJid, key.id)?.message || undefined;
        }
    });

    global.store.bind(sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') iniciarBot();
        else if (connection === 'open') console.log(`[INFO] Bot Online (${plugins.length} plugins activos).`);
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const remitente = msg.key.remoteJid;

        const messageContent = extractMessageContent(msg.message);
        const texto = messageContent?.conversation ||
                      messageContent?.extendedTextMessage?.text ||
                      messageContent?.imageMessage?.caption ||
                      messageContent?.videoMessage?.caption || '';

        const textoLimpio = texto.trim();
        const quoted = messageContent?.extendedTextMessage?.contextInfo?.quotedMessage;

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
