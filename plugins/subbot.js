import { Browsers, makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import NodeCache from 'node-cache';

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

export default {
    name: 'subbot_avanzado',
    // Soporta .code (recomendado para VPS) o .qr
    match: (text) => /^\.(code|qr|botclone|jadibot)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const command = textoLimpio.toLowerCase().split(' ')[0].replace('.', '');
        
        // 1. Inicialización de usuario en DB si no existe
        if (!global.db.data.users[remitente]) global.db.data.users[remitente] = {};
        
        // 2. Sistema de Cooldown (120 segundos)
        let lastSub = global.db.data.users[remitente].Subs || 0;
        let timeLapse = Date.now() - lastSub;
        if (timeLapse < 120000) {
            return sock.sendMessage(remitente, { 
                text: `⏳ Debes esperar *${msToTime(120000 - timeLapse)}* para volver a intentar vincular un socket.` 
            }, { quoted: msg });
        }

        // 3. Control de límite de Sub-Bots (Max 50)
        const subsPath = path.join(process.cwd(), 'jadibts');
        if (!fs.existsSync(subsPath)) fs.mkdirSync(subsPath, { recursive: true });
        
        const subsCount = fs.readdirSync(subsPath).filter((dir) => fs.existsSync(path.join(subsPath, dir, 'creds.json'))).length;
        if (subsCount >= 50) {
            return sock.sendMessage(remitente, { text: '❌ No hay espacios disponibles en la VPS para registrar un nuevo Sub-Bot (Límite: 50).' }, { quoted: msg });
        }

        commandFlags[remitente] = true;
        
        const isCode = !/^(qr)$/.test(command); // Por defecto usa Code, a menos que especifique qr
        const phone = remitente.split('@')[0];
        const id = phone;
        const sessionFolder = path.join(subsPath, id);

        const rtx = `\`✤\` Vincula tu *cuenta* usando el *código.*\n\n> ✥ Sigue las *instrucciones*\n\n*›* Click en los *3 puntos*\n*›* Toque *dispositivos vinculados*\n*›* Vincular *nuevo dispositivo*\n*›* Selecciona *Vincular con el número de teléfono*\n\n⚠️ *Este Código caduca rápido y solo sirve para tu número.*`;
        
        global.db.data.users[remitente].Subs = Date.now();

        // Iniciar el proceso del Sub-Bot
        await startSubBot(sock, remitente, msg, sessionFolder, phone, isCode, rtx);
    }
};

// Función Core del Sub-Bot
async function startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption) {
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
        getMessage: async () => '', // Ignora la verificación de historial local para no saturar RAM
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
            await mainSock.sendMessage(remitente, { text: `✅ *Sub-Bot conectado con éxito.*\n\nID: @${subSock.userId}`, mentions: [`${subSock.userId}@s.whatsapp.net`] });
        }

        if (connection === 'close') {
            const botId = subSock.userId || phone;
            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 0;
            const intentos = reintentos[botId] || 0;
            reintentos[botId] = intentos + 1;

            // Manejo de errores de autenticación (401, 403) con 5 reintentos
            if ([401, 403].includes(reason)) {
                if (intentos < 5) {
                    console.log(`[SUB-BOT] ${botId} Conexión cerrada (Código ${reason}). Intento ${intentos}/5 → Reintentando en 3s...`);
                    setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption), 3000);
                } else {
                    console.log(`[SUB-BOT] ${botId} Falló tras 5 intentos. Eliminando sesión corrupta.`);
                    try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
                    delete reintentos[botId];
                    await mainSock.sendMessage(remitente, { text: `❌ Tu sesión expiró o fue cerrada desde los ajustes de WhatsApp. El Sub-Bot fue eliminado.` });
                }
                return;
            }

            // Manejo de desconexiones temporales de red
            if ([DisconnectReason.connectionClosed, DisconnectReason.connectionLost, DisconnectReason.timedOut, DisconnectReason.connectionReplaced].includes(reason)) {
                setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption), 3000);
                return;
            }
            
            setTimeout(() => startSubBot(mainSock, remitente, msg, sessionFolder, phone, isCode, caption), 3000);
        }
    });

    // Petición del Pairing Code
    if (!subSock.authState.creds.registered && isCode && commandFlags[remitente]) {
        setTimeout(async () => {
            try {
                let codeGen = await subSock.requestPairingCode(phone);
                codeGen = codeGen.match(/.{1,4}/g)?.join("-") || codeGen;
                
                await mainSock.sendMessage(remitente, { text: caption });
                const msgCode = await mainSock.sendMessage(remitente, { text: codeGen });
                
                delete commandFlags[remitente];
                
                // Borrar el código a los 60s por seguridad
                setTimeout(async () => {
                    try { await mainSock.sendMessage(remitente, { delete: msgCode.key }); } catch {}
                }, 60000);
                
            } catch (err) {
                console.error("[Código Error]", err);
                await mainSock.sendMessage(remitente, { text: "❌ Error al generar el código. Intenta de nuevo más tarde." });
                try { fs.rmSync(sessionFolder, { recursive: true, force: true }); } catch (e) {}
            }
        }, 3000);
    }
}
