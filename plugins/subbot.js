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
                await startSubBot(null, null, null, sessionFolder, id, false, null, true);
                // Retraso de 3s entre arranques para no ahogar la CPU de la VPS
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
}, 10000); // Espera 10s para asegurarse de que el bot principal y la DB ya cargaron
// ==========================================

export default {
    name: 'subbot_avanzado',
    match: (text) => /^\.(code|qr|botclone|jadibot)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const command = textoLimpio.toLowerCase().split(' ')[0].replace('.', '');
        
        if (!global.db.data.users[remitente]) global.db.data.users[remitente] = {};
        
        let lastSub = global.db.data.users[remitente].Subs || 0;
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

        commandFlags[remitente] = true;
        
        const isCode = !/^(qr)$/.test(command);
        
        // FIX CRÍTICO: Limpieza estricta del número. Si el remitente es "34600000000:1@s.whatsapp.net", extrae solo "34600000000"
        const phone = remitente.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        const id = phone;
        const sessionFolder = path.join(subsPath, id);

        const rtx = `\`✤\` Vincula tu *cuenta* usando el *código.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Selecciona *Vincular con el número de teléfono*\n\n⚠️ *Este Código caduca rápido y solo sirve para tu número.*`;
        
        global.db.data.users[remitente].Subs = Date.now();

        await startSubBot(sock, remitente, msg, sessionFolder, phone, isCode, rtx, false);
    }
};

// ==========================================
// NÚCLEO AUTÓNOMO DEL SUB-BOT (VERSIÓN CORREGIDA)
// ==========================================
async function startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption, isAutoReconnect = false) {
    
    // ✅ FIX 1: Validar y limpiar número de teléfono
    const cleanPhone = phone.replace(/\D/g, ''); // Elimina todo excepto dígitos
    
    if (!isAutoReconnect && isCode) {
        // Validar formato internacional
        if (cleanPhone.length < 10 || cleanPhone.length > 15) {
            if (mainSock && remitente) {
                await mainSock.sendMessage(remitente, { 
                    text: `❌ Número inválido: *${phone}*\n\nDebe estar en formato internacional sin el símbolo +\n\nEjemplo: 34612345678` 
                });
            }
            return;
        }
        console.log(`[SUB-BOT] Número limpio para pairing: ${cleanPhone}`);
    }
    
    // ✅ FIX 2: Verificar y limpiar sesión existente si hay error
    const credsPath = path.join(sessionFolder, 'creds.json');
    if (!isAutoReconnect && isCode && fs.existsSync(credsPath)) {
        console.log(`[SUB-BOT] Eliminando sesión existente en ${sessionFolder}`);
        try {
            fs.rmSync(sessionFolder, { recursive: true, force: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            console.error(`[SUB-BOT] Error limpiando sesión:`, e);
        }
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();

    const subSock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
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

    // ✅ FIX 3: Mejorar manejo de conexión
    subSock.ev.on('connection.update', async ({ connection, lastDisconnect, isNewLogin, qr }) => {
        if (isNewLogin) subSock.isInit = false;
        
        if (connection === 'open') {
            subSock.uptime = Date.now();
            subSock.isInit = true;
            subSock.userId = subSock.user?.id?.split(':')[0];
            
            if (!global.conns.find((c) => c.userId === subSock.userId)) {
                global.conns.push(subSock);
            }

            delete reintentos[subSock.userId || cleanPhone];
            
            console.log(`[SUB-BOT] ✅ Conectado exitosamente: ${subSock.userId}`);
            if (!isAutoReconnect && mainSock && remitente) {
                await mainSock.sendMessage(remitente, { 
                    text: `✅ *Sub-Bot conectado con éxito.*\n\nID: @${subSock.userId}\n⏱️ Sesión activa`, 
                    mentions: [`${subSock.userId}@s.whatsapp.net`] 
                });
            }
        }

        if (connection === 'close') {
            const botId = subSock.userId || cleanPhone;
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 0;
            const intentos = reintentos[botId] || 0;
            reintentos[botId] = intentos + 1;

            console.log(`[SUB-BOT] ⚠️ Conexión cerrada. Código: ${reason}, Intentos: ${intentos}/5`);

            // Códigos de error críticos
            if ([401, 403, 405].includes(reason)) {
                if (intentos < 5) {
                    console.log(`[SUB-BOT] ${botId} Reintentando en 5s...`);
                    setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, cleanPhone, isCode, caption, isAutoReconnect), 5000);
                } else {
                    console.log(`[SUB-BOT] ${botId} ❌ Falló tras 5 intentos. Eliminando sesión.`);
                    try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
                    delete reintentos[botId];
                    if (!isAutoReconnect && mainSock && remitente) {
                        await mainSock.sendMessage(remitente, { 
                            text: `❌ *Error de vinculación*\n\nPosibles causas:\n• Código expirado (genera uno nuevo con .code)\n• Número incorrecto en el dispositivo\n• Sesión ya vinculada en otro lugar\n\n💡 Intenta de nuevo con *.code*` 
                        });
                    }
                }
                return;
            }

            // Reconexión automática para errores transitorios
            if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.connectionReplaced].includes(reason)) {
                setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, cleanPhone, isCode, caption, isAutoReconnect), 3000);
                return;
            }
            
            // Fallback para cualquier otro error
            setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, cleanPhone, isCode, caption, isAutoReconnect), 5000);
        }
    });

    // ✅ FIX 4: Mejorar generación de código con retry
    if (!subSock.authState.creds.registered && isCode && !isAutoReconnect && commandFlags[remitente] && mainSock) {
        // Esperar a que la conexión esté lista
        const waitForConnection = new Promise((resolve) => {
            const interval = setInterval(() => {
                if (subSock.ws?.readyState === 1) { // WebSocket OPEN
                    clearInterval(interval);
                    resolve();
                }
            }, 500);
            
            // Timeout de 10 segundos
            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 10000);
        });
        
        await waitForConnection;
        
        setTimeout(async () => {
            try {
                console.log(`[SUB-BOT] Solicitando código de emparejamiento para: ${cleanPhone}`);
                
                let codeGen = await subSock.requestPairingCode(cleanPhone);
                codeGen = codeGen.match(/.{1,4}/g)?.join("-") || codeGen;
                
                console.log(`[SUB-BOT] ✅ Código generado: ${codeGen}`);
                
                await mainSock.sendMessage(remitente, { text: caption });
                const msgCode = await mainSock.sendMessage(remitente, { 
                    text: `🔐 *CÓDIGO DE VINCULACIÓN*\n\n\`\`\`${codeGen}\`\`\`\n\n⏱️ Este código expira en *1 minuto*\n📱 Úsalo en: *Dispositivos vinculados > Vincular con número*\n\n⚠️ *IMPORTANTE:*\n• El número en tu dispositivo debe ser: *${cleanPhone}*\n• Si el código no funciona, escribe *.code* para generar uno nuevo` 
                });
                
                delete commandFlags[remitente];
                
                // Eliminar el código después de 60 segundos
                setTimeout(async () => {
                    try { 
                        await mainSock.sendMessage(remitente, { delete: msgCode.key }); 
                        await mainSock.sendMessage(remitente, { 
                            text: `⏱️ El código ha expirado. Escribe *.code* para generar uno nuevo.` 
                        });
                    } catch {}
                }, 60000);
                
            } catch (err) {
                console.error("[SUB-BOT] ❌ Error generando código:", err);
                
                let errorMsg = "❌ *Error al generar el código*\n\n";
                
                if (err.message?.includes('not-authorized')) {
                    errorMsg += "• Tu sesión expiró o fue cerrada\n• Limpia la sesión y vuelve a intentar";
                } else if (err.message?.includes('timed out')) {
                    errorMsg += "• Tiempo de espera agotado\n• Verifica tu conexión a internet";
                } else {
                    errorMsg += `• ${err.message || 'Error desconocido'}\n• Intenta de nuevo en unos segundos`;
                }
                
                await mainSock.sendMessage(remitente, { text: errorMsg });
                
                // Limpiar sesión corrupta
                try { 
                    fs.rmSync(sessionFolder, { recursive: true, force: true }); 
                    console.log(`[SUB-BOT] Sesión corrupta eliminada: ${sessionFolder}`);
                } catch (e) {}
                delete commandFlags[remitente];
            }
        }, 5000); // Delay de 5 segundos para asegurar estabilidad
    }

    // ==========================================
    // EJECUCIÓN AUTÓNOMA DE PLUGINS (Sin cambios)
    // ==========================================
    subSock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.message || message.key.remoteJid === 'status@broadcast') return;

        global.db.data = global.db.getState();
        const senderJid = message.key.remoteJid;
        const texto = message.message.conversation || message.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const msgType = Object.keys(message.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType) return;

        const isGroup = senderJid.endsWith('@g.us');
        if (isGroup && global.db.data.settings.grupos === false && !/^\.grupo\s+on$/i.test(textoLimpio)) return;

        if (!global.chatHistory) global.chatHistory = new Map();
        if (!global.chatHistory.has(senderJid)) global.chatHistory.set(senderJid, []);
        const history = global.chatHistory.get(senderJid);
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

        const ctx = { sock: subSock, msg: message, remitente: senderJid, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted, msgType };

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
