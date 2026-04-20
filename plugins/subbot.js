import { Browsers, makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason, downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import NodeCache from 'node-cache';
import { pathToFileURL } from 'url';

if (!global.conns) global.conns = [];
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });
const groupCache = new NodeCache({ stdTTL: 3600, checkperiod: 300 });
let reintentos = {};
let commandFlags = {};

const msToTime = (duration) => {
    let seconds = Math.floor((duration / 1000) % 60);
    let minutes = Math.floor((duration / (1000 * 60)) % 60);
    let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    hours = hours < 10 ? '0' + hours : hours;
    let res = [];
    if (hours > 0) res.push(`${hours}h`);
    if (minutes > 0) res.push(`${minutes}m`);
    if (seconds > 0) res.push(`${seconds}s`);
    return res.join(', ') || '0s';
};

// ==========================================
// AUTO-ARRANQUE DE SUB-BOTS TRAS REINICIO DE VPS
// ==========================================
setTimeout(async () => {
    const subsPath = path.join(process.cwd(), 'jadibts');
    if (fs.existsSync(subsPath)) {
        const botIds = fs.readdirSync(subsPath);
        for (const id of botIds) {
            const sessionFolder = path.join(subsPath, id);
            if (fs.existsSync(path.join(sessionFolder, 'creds.json'))) {
                console.log(`[SUB-BOT] Auto-reconectando sesión de @${id}...`);
                await startSubBot(null, null, null, sessionFolder, id, false, null, true, id);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
}, 10000); 
// ==========================================

export default {
    name: 'subbot_avanzado',
    match: (text) => /^\.(code|qr|botclone|jadibot)/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        
        // Extraer el ID real del usuario que manda el mensaje (vital en grupos)
        const senderJid = msg.key.participant || remitente;

        if (!global.db.data.users[senderJid]) global.db.data.users[senderJid] = {};
        
        let lastSub = global.db.data.users[senderJid].Subs || 0;
        let timeLapse = Date.now() - lastSub;
        if (timeLapse < 120000) {
            return sock.sendMessage(remitente, { 
                text: `⏳ Debes esperar *${msToTime(120000 - timeLapse)}* para volver a intentar vincular un socket.` 
            }, { quoted: msg });
        }

        const subsPath = path.join(process.cwd(), 'jadibts');
        if (!fs.existsSync(subsPath)) fs.mkdirSync(subsPath, { recursive: true });
        
        const subsCount = fs.readdirSync(subsPath).filter((dir) => fs.existsSync(path.join(subsPath, dir, 'creds.json'))).length;
        if (subsCount >= 50) {
            return sock.sendMessage(remitente, { text: '❌ No hay espacios disponibles en la VPS para registrar un nuevo Sub-Bot (Límite: 50).' }, { quoted: msg });
        }

        commandFlags[senderJid] = true;
        const isCode = !/^(qr)$/.test(command);
        
        // FIX CRÍTICO: Definición estricta del número. Si el usuario envía un número (.botclone 346XXXXXX), se usa ese.
        // Si no, se extrae limpiamente de su propio JID.
        let phone = "";
        if (args[1]) {
            phone = args[1].replace(/[^0-9]/g, '');
        } else {
            phone = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        }

        if (!phone || phone.length < 8) {
            return sock.sendMessage(remitente, { text: '❌ No pude extraer un número de teléfono válido. Usa: `.botclone 34600000000` (reemplaza con tu número y código de país).' }, { quoted: msg });
        }

        const id = phone;
        const sessionFolder = path.join(subsPath, id);

        const rtx = `\`✤\` Vincula tu *cuenta* usando el *código.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Selecciona *Vincular con el número de teléfono*\n\n⚠️ *AVISO:* Este código fue generado EXACTAMENTE para el número *+${phone}*. Si entras desde otro número de WhatsApp distinto, dará error.`;
        
        global.db.data.users[senderJid].Subs = Date.now();

        await startSubBot(sock, remitente, msg, sessionFolder, phone, isCode, rtx, false, senderJid);
    }
};

// ==========================================
// NÚCLEO AUTÓNOMO DEL SUB-BOT
// ==========================================
async function startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption, isAutoReconnect = false, senderJid) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    const subSock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        getMessage: async () => '',
        msgRetryCounterCache,
        userDevicesCache,
        cachedGroupMetadata: async (jid) => groupCache.get(jid),
        version,
        keepAliveIntervalMs: 60_000,
        maxIdleTimeMs: 120_000,
    });

    subSock.isInit = false;
    subSock.ev.on('creds.update', saveCreds);

    subSock.ev.on('connection.update', async ({ connection, lastDisconnect, isNewLogin }) => {
        if (isNewLogin) subSock.isInit = false;
        
        if (connection === 'open') {
            subSock.uptime = Date.now();
            subSock.isInit = true;
            subSock.userId = subSock.user?.id?.split(':')[0];
            
            if (!global.conns.find((c) => c.userId === subSock.userId)) {
                global.conns.push(subSock);
            }

            delete reintentos[subSock.userId || phone];
            
            console.log(`[SUB-BOT] Conectado exitosamente: ${subSock.userId}`);
            if (!isAutoReconnect && mainSock && remitente) {
                await mainSock.sendMessage(remitente, { text: `✅ *Sub-Bot conectado con éxito.*\n\nID: @${subSock.userId}`, mentions: [`${subSock.userId}@s.whatsapp.net`] });
            }
        }

        if (connection === 'close') {
            const botId = subSock.userId || phone;
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 0;
            const intentos = reintentos[botId] || 0;
            reintentos[botId] = intentos + 1;

            if ([401, 403].includes(reason)) {
                if (intentos < 5) {
                    console.log(`[SUB-BOT] ${botId} Conexión cerrada (Código ${reason}). Intento ${intentos}/5 → Reintentando en 3s...`);
                    setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption, isAutoReconnect, senderJid), 3000);
                } else {
                    console.log(`[SUB-BOT] ${botId} Falló tras 5 intentos. Eliminando sesión corrupta.`);
                    try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
                    delete reintentos[botId];
                    if (!isAutoReconnect && mainSock && remitente) {
                        await mainSock.sendMessage(remitente, { text: `❌ Tu sesión expiró o fue rechazada por Meta. El Sub-Bot fue eliminado.` });
                    }
                }
                return;
            }

            if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.connectionReplaced].includes(reason)) {
                setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption, isAutoReconnect, senderJid), 3000);
                return;
            }
            
            setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption, isAutoReconnect, senderJid), 3000);
        }
    });

    if (!subSock.authState.creds.registered && isCode && !isAutoReconnect && commandFlags[senderJid] && mainSock) {
        setTimeout(async () => {
            try {
                let codeGen = await subSock.requestPairingCode(phone);
                codeGen = codeGen.match(/.{1,4}/g)?.join("-") || codeGen;
                
                await mainSock.sendMessage(remitente, { text: caption });
                const msgCode = await mainSock.sendMessage(remitente, { text: codeGen });
                
                delete commandFlags[senderJid];
                
                setTimeout(async () => {
                    try { await mainSock.sendMessage(remitente, { delete: msgCode.key }); } catch {}
                }, 60000);
                
            } catch (err) {
                console.error("[Código Error]", err);
                await mainSock.sendMessage(remitente, { text: "❌ Error al generar el código. Si falla repetidamente, espera 1 hora por los límites de WhatsApp." });
                try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
            }
        }, 4000);
    }

    subSock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message || message.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const incomingSender = message.key.remoteJid;
        const texto = message.message.conversation || message.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const msgType = Object.keys(message.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType) return;

        const isGroup = incomingSender.endsWith('@g.us');
        if (isGroup && global.db.data.settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) return;

        if (!global.chatHistory) global.chatHistory = new Map();
        if (!global.chatHistory.has(incomingSender)) global.chatHistory.set(incomingSender, []);
        const history = global.chatHistory.get(incomingSender);
        history.push({ role: message.key.fromMe ? 'model' : 'user', parts: [{ text: textoLimpio || `[Envió: ${msgType}]` }] });
        if (history.length > 25) history.shift();

        if (!global.loadedPlugins) {
            const pluginsDir = path.join(process.cwd(), 'plugins');
            if (fs.existsSync(pluginsDir)) {
                const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
                global.loadedPlugins = await Promise.all(pluginFiles.map(async (file) => {
                    try {
                        const fullPath = path.join(pluginsDir, file);
                        const module = await import(pathToFileURL(fullPath).href);
                        return module.default || module;
                    } catch (e) { return null; }
                }));
                global.loadedPlugins = global.loadedPlugins.filter(p => p !== null);
            } else {
                global.loadedPlugins = [];
            }
        }

        const getMediaInfo = (msgObj) => {
            if (!msgObj) return null;
            if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
            if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
            if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
            if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
            return null;
        };

        const ctx = { sock: subSock, msg: message, remitente: incomingSender, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted, msgType };

        for (const plugin of global.loadedPlugins) {
            if (plugin.match && plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                    global.db.write();
                } catch (err) {
                    console.error(`Error en subbot plugin ${plugin.name}:`, err);
                }
                break; 
            }
        }
    });
}
