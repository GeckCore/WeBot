import { default as makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Caché global de plugins para clones (optimización de RAM)
let clonePlugins = null;

export default {
    name: 'botclone',
    match: (text) => /^\.(botclone|jadibot)$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Levantando sub-instancia. Solicitando QR a Meta..." }, { quoted: msg });

        const cloneId = remitente.split('@')[0];
        const clonesDir = path.resolve('./clones');
        if (!fs.existsSync(clonesDir)) fs.mkdirSync(clonesDir);
        
        const sessionDir = path.join(clonesDir, `session_${cloneId}`);

        // Si ya hay una sesión, no generamos QR, intentamos reconectar directamente
        const isSessionExists = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const cloneSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // Oculto en terminal principal para no ensuciar tus logs
            browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
            syncFullHistory: false
        });

        cloneSock.ev.on('creds.update', saveCreds);

        cloneSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Renderizado de QR externalizado vía API (Evita crasheos por dependencias faltantes en VPS)
            if (qr) {
                try {
                    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`;
                    await sock.sendMessage(remitente, {
                        image: { url: qrApiUrl },
                        caption: "📲 *NUEVA SESIÓN CREADA*\nAbre WhatsApp en el teléfono secundario > Dispositivos vinculados > Vincular un dispositivo.\n\n_Nota: El código se refrescará si tardas demasiado._"
                    }, { quoted: msg });
                    
                    // Borramos el mensaje de espera solo la primera vez
                    if (statusMsg) await sock.sendMessage(remitente, { delete: statusMsg.key }).catch(()=>{});
                } catch (e) {
                    console.error("[CLON] Error al obtener imagen QR externa:", e);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    await sock.sendMessage(remitente, { text: "❌ La sesión del clon fue cerrada desde el dispositivo móvil. Destruyendo datos." });
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log(`[CLON ${cloneId}] Conexión cerrada, reconectando...`);
                } else if (reason === DisconnectReason.timedOut) {
                    console.log(`[CLON ${cloneId}] Timeout. El QR expiró o la red falló.`);
                    if (!isSessionExists) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        await sock.sendMessage(remitente, { text: "⏳ El QR expiró sin ser escaneado. Vuelve a ejecutar el comando." });
                    }
                }
            } else if (connection === 'open') {
                await sock.sendMessage(remitente, { text: "✅ Sub-instancia conectada y operando. Tu clon ya responde a los comandos." });
            }
        });

        if (!clonePlugins) {
            const pluginsDir = path.resolve('./plugins');
            const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
            clonePlugins = await Promise.all(pluginFiles.map(async (file) => {
                try {
                    const fullPath = path.join(pluginsDir, file);
                    const module = await import(pathToFileURL(fullPath).href);
                    return module.default || module;
                } catch (err) {
                    return null;
                }
            }));
            clonePlugins = clonePlugins.filter(p => p !== null);
        }

        const getMediaInfo = (msgObj) => {
            if (!msgObj) return null;
            if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
            if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
            if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
            if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
            return null;
        };

        // Escucha de mensajes del clon
        cloneSock.ev.on('messages.upsert', async (m) => {
            const cloneMsg = m.messages[0];
            if (!cloneMsg.message || cloneMsg.key.remoteJid === 'status@broadcast') return;

            const cloneRemitente = cloneMsg.key.remoteJid;
            
            let texto = cloneMsg.message.conversation || cloneMsg.message.extendedTextMessage?.text || "";
            let buttonText = "";
            try {
                if (cloneMsg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
                    buttonText = JSON.parse(cloneMsg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id || "";
                }
            } catch (e) {}
            
            if (!buttonText) {
                buttonText = cloneMsg?.message?.buttonsResponseMessage?.selectedButtonId || cloneMsg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId || cloneMsg?.message?.templateButtonReplyMessage?.selectedId || "";
            }
            if (buttonText) texto = buttonText;

            const textoLimpio = texto.trim();
            const msgType = Object.keys(cloneMsg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
            const quoted = cloneMsg.message.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!textoLimpio && !msgType && !buttonText) return;

            const ctx = { 
                sock: cloneSock, 
                msg: cloneMsg, 
                remitente: cloneRemitente, 
                textoLimpio, 
                getMediaInfo, 
                downloadContentFromMessage, 
                quoted, 
                msgType 
            };

            for (const plugin of clonePlugins) {
                if (plugin.match && plugin.match(textoLimpio, ctx)) {
                    try {
                        await plugin.execute(ctx);
                        global.db.write();
                    } catch (err) {
                        console.error(`Error en clon ${cloneId} plugin ${plugin.name}:`, err);
                    }
                    break;
                }
            }
        });
    }
};
