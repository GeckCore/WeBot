const baileysModule = require('@whiskeysockets/baileys');
const { proto, isJidBroadcast } = baileysModule;

// --- EXTRACCIÓN DE FUNCIONES BAILEYS (Estilo Robusto) ---
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

const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');

// --- BASE DE DATOS ---
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('database.json');
global.db = low(adapter);
global.db.defaults({ users: {}, chats: {}, settings: {} }).write();

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ PERSISTENTE (CORREGIDA)
// ─────────────────────────────────────────────────────────────────────────────
const MSG_STORE_FILE = path.join(__dirname, 'mediaMessageStore.json');
const MSG_STORE_LIMIT = 1500;
global.mediaCache = new Map();

function loadPersistentMsgStore() {
    try {
        if (fs.existsSync(MSG_STORE_FILE)) {
            const raw = fs.readFileSync(MSG_STORE_FILE, 'utf8');
            // RECOSTRUCTOR DE BUFFERS: Convierte el texto del JSON de vuelta a Binarios reales
            const reviver = (k, v) => {
                if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) {
                    return Buffer.from(v.data);
                }
                return v;
            };
            const entries = JSON.parse(raw, reviver);
            for (const { id, msg } of entries) {
                if (id && msg) global.mediaCache.set(id, msg);
            }
            console.log(`[STORE] ✅ Registro recuperado: ${global.mediaCache.size} mensajes listos.`);
        }
    } catch (e) {
        console.error('[STORE] ❌ Error:', e.message);
    }
}

function saveMsgStore() {
    try {
        const entries = Array.from(global.mediaCache.entries()).map(([id, msg]) => ({ id, msg }));
        fs.writeFileSync(MSG_STORE_FILE, JSON.stringify(entries));
    } catch (e) {
        console.error('[STORE] ❌ Error al guardar disco:', e.message);
    }
}

loadPersistentMsgStore();

// ─────────────────────────────────────────────────────────────────────────────
// STORE EN MEMORIA (CLONACIÓN PROFUNDA)
// ─────────────────────────────────────────────────────────────────────────────
function customInMemoryStore() {
    let messages = {};

    function loadMessage(jid, id = null) {
        if (jid && !id) {
            const filter = m => m.key?.id == jid;
            return Object.values(messages).flat().find(filter) || null;
        }
        const normalJid = jidNormalizedUser(jid);
        return messages[normalJid]?.find(m => m.key.id == id) || null;
    }

    function upsertMessage(jid, message) {
        const msgId = message.key?.id;
        if (!msgId) return;

        // 🔥 CLONACIÓN: Si es ViewOnce, creamos una copia física independiente
        // Esto evita que el mensaje desaparezca de la RAM cuando se abre en el móvil.
        const msgStr = JSON.stringify(message);
        if (msgStr.includes('viewOnce')) {
            global.mediaCache.set(msgId, lodash.cloneDeep(message));
            console.log(`[CACHÉ] 👁️ Efímero capturado: ${msgId}`);
            saveMsgStore();
        } else {
            global.mediaCache.set(msgId, message);
        }

        const normalJid = jidNormalizedUser(jid);
        if (!(normalJid in messages)) messages[normalJid] = [];
        messages[normalJid].push(message);
        if (messages[normalJid].length > 500) messages[normalJid].shift();
    }

    return {
        bind: (conn) => {
            conn.ev.on('messages.upsert', ({ messages: newMessages, type }) => {
                if (['append', 'notify'].includes(type)) {
                    for (const msg of newMessages) {
                        const jid = jidNormalizedUser(msg.key.remoteJid);
                        if (!jid || isJidBroadcast(jid)) continue;
                        upsertMessage(jid, msg);
                    }
                }
            });
        },
        loadMessage
    };
}

global.store = customInMemoryStore();

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['TheMystic-Bot', 'Chrome', '122.0.0.0'],
        getMessage: async (key) => {
            const cached = global.mediaCache.get(key.id);
            return cached?.message || global.store.loadMessage(key.remoteJid, key.id)?.message || undefined;
        }
    });

    global.store.bind(sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (u) => {
        if (u.qr) qrcode.generate(u.qr, { small: true });
        if (u.connection === 'close') iniciarBot();
        if (u.connection === 'open') console.log('[INFO] Online.');
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const content = extractMessageContent(msg.message);
        const texto = content?.conversation || content?.extendedTextMessage?.text || 
                      content?.imageMessage?.caption || content?.videoMessage?.caption || '';
        const textoLimpio = texto.trim();

        // Carga de plugins (usa tu lógica actual de fs.readdirSync)
        // ctx = { sock, msg, remitente: msg.key.remoteJid, textoLimpio, downloadContentFromMessage, extractMessageContent, quoted: content?.extendedTextMessage?.contextInfo?.quotedMessage }
    });
}

iniciarBot();
