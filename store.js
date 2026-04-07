/*
 * store.js - Parcheado con Auto-Bind e Interceptor Letal para TheMystic-Bot
 */
const { proto, isJidBroadcast, updateMessageWithReceipt, updateMessageWithReaction, jidNormalizedUser } = (await import('baileys')).default;

const TIME_TO_DATA_STALE = 5 * 60 * 1000;
const MAX_MESSAGES_PER_CHAT = 1500;
let isBound = false;

function makeInMemoryStore() {
    let chats = {};
    let messages = {};

    function getJid(jid) {
        return jid?.decodeJid?.() || jidNormalizedUser(jid) || jid;
    }

    // Clonación profunda extrema para independizar el objeto antes de la purga
    function safeClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Buffer.isBuffer(obj)) return Buffer.from(obj);
        if (obj instanceof Uint8Array) return new Uint8Array(obj);
        if (Array.isArray(obj)) return obj.map(safeClone);
        
        const cloned = {};
        for (const key in obj) {
            if (key === 'messageContextInfo' || key === 'senderKeyDistributionMessage') continue;
            cloned[key] = safeClone(obj[key]);
        }
        return cloned;
    }

    function loadMessage(jid, id = null) {
        let message = null;
        if (jid && !id) {
            id = jid;
            const filter = m => m.key?.id == id;
            const messageFind = Object.entries(messages).find(([, msgs]) => msgs.find(filter));
            message = messageFind?.[1]?.find(filter);
        } else {
            jid = getJid(jid);
            if (!(jid in messages)) return null;
            message = messages[jid]?.find(m => m.key.id == id);
        }
        return message || null;
    }

    function upsertMessage(jid, message, type = 'append') {
        jid = getJid(jid);
        if (!(jid in messages)) messages[jid] = [];
        
        delete message.message?.messageContextInfo;
        delete message.message?.senderKeyDistributionMessage;
        
        const msgId = message.key?.id;
        const msg = loadMessage(jid, msgId);
        if (msg) {
            Object.assign(msg, message);
        } else {
            type === 'append' ? messages[jid].push(message) : messages[jid].unshift(message);
        }

        if (messages[jid].length > MAX_MESSAGES_PER_CHAT) {
            messages[jid].splice(0, messages[jid].length - MAX_MESSAGES_PER_CHAT);
        }
    }

    function bind(conn) {
        if (isBound) return;
        isBound = true;

        if (!conn.chats) conn.chats = {};

        // INTERCEPTOR LETAL: Captura el evento nativo de Baileys antes que los handlers del bot
        const originalEmit = conn.ev.emit;
        conn.ev.emit = function (name, data) {
            if (name === 'messages.upsert' && data && data.messages) {
                for (const msg of data.messages) {
                    if (!msg || !msg.key) continue;
                    
                    const msgId = msg.key.id;
                    if (msgId && msg.message) {
                        const content = msg.message;
                        const isMediaOrEfimero = content && (
                            content.viewOnceMessage || 
                            content.viewOnceMessageV2 || 
                            content.viewOnceMessageV2Extension || 
                            content.ephemeralMessage || 
                            content.imageMessage || 
                            content.videoMessage || 
                            content.audioMessage
                        );

                        if (isMediaOrEfimero) {
                            if (!global.mediaCache) global.mediaCache = new Map();
                            // Se guarda la copia intacta antes de que handler.js borre msg.message
                            global.mediaCache.set(msgId, safeClone(msg));
                        }
                    }
                }
            }
            return originalEmit.apply(this, arguments);
        };

        conn.ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            if (['append', 'notify'].includes(type)) {
                for (const msg of newMessages) {
                    const jid = getJid(msg.key.remoteJid);
                    if (!jid || isJidBroadcast(jid)) continue;
                    upsertMessage(jid, msg, type);
                }
            }
        });

        conn.ev.on('messages.update', updates => {
            for (const { key, update } of updates) {
                const jid = getJid(key.remoteJid);
                const message = loadMessage(jid, key.id);
                if (message) Object.assign(message, update);
            }
        });

        conn.ev.on('message-receipt.update', updates => {
            for (const { key, receipt } of updates) {
                const jid = getJid(key.remoteJid);
                const message = loadMessage(jid, key.id);
                if (message) updateMessageWithReceipt(message, receipt);
            }
        });

        conn.ev.on('messages.reaction', updates => {
            for (const { key, reaction } of updates) {
                const jid = getJid(key.remoteJid);
                const message = loadMessage(jid, key.id);
                if (message) updateMessageWithReaction(message, reaction);
            }
        });

        conn.ev.on('chats.set', ({ chats: newChats }) => {
            for (const chat of newChats) {
                const jid = getJid(chat.id);
                if (!(jid in chats)) chats[jid] = { id: jid };
                Object.assign(chats[jid], chat);
            }
        });

        conn.ev.on('chats.upsert', newChats => {
            for (const chat of newChats) {
                const jid = getJid(chat.id);
                if (!(jid in chats)) chats[jid] = { id: jid };
                Object.assign(chats[jid], chat);
            }
        });

        conn.ev.on('chats.update', updates => {
            for (const update of updates) {
                const jid = getJid(update.id);
                if (!(jid in chats)) chats[jid] = { id: jid };
                Object.assign(chats[jid], update);
            }
        });
    }

    return { bind, loadMessage, messages, chats };
}

const store = makeInMemoryStore();
global.store = store;

// AUTO-BIND: Se asegura de vincularse a la conexión principal ni bien exista, sin tocar main.js
const bindInterval = setInterval(() => {
    if (global.conn && global.conn.ev && !isBound) {
        store.bind(global.conn);
        clearInterval(bindInterval);
        console.log('[STORE] ✅ Vinculado exitosamente a global.conn mediante Auto-Bind');
    }
}, 1000);

export default store;
