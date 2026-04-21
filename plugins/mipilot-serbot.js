import { default as makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// Caché global de plugins para clones: evita saturar la RAM recargando archivos del disco por cada amigo que se conecte
let clonePlugins = null;

export default {
    name: 'botclone',
    match: (text) => /^\.(botclone|jadibot)$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Levantando sub-instancia. Generando código QR..." }, { quoted: msg });

        const cloneId = remitente.split('@')[0];
        const clonesDir = path.resolve('./clones');
        if (!fs.existsSync(clonesDir)) fs.mkdirSync(clonesDir);
        
        const sessionDir = path.join(clonesDir, `session_${cloneId}`);

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const cloneSock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '122.0.0.0'],
            syncFullHistory: false
        });

        cloneSock.ev.on('creds.update', saveCreds);

        cloneSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    const qrBuffer = await qrcode.toBuffer(qr, { scale: 8 });
                    await sock.sendMessage(remitente, {
                        image: qrBuffer,
                        caption: "📲 *ESCANEA ESTE QR*\nAbre WhatsApp en el otro teléfono > Dispositivos vinculados > Vincular un dispositivo.\nEl QR se actualizará automáticamente si caduca."
                    }, { quoted: msg });
                    await sock.sendMessage(remitente, { delete: statusMsg.key }).catch(()=>{});
                } catch (e) {
                    console.error("Error al generar imagen QR:", e);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    await sock.sendMessage(remitente, { text: "❌ Sesión cerrada desde el móvil. La instancia ha sido destruida. Usa el comando de nuevo para reconectar." });
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                } else {
                    console.log(`[CLON ${cloneId}] Desconexión técnica. El sistema intentará reconectar automáticamente.`);
                }
            } else if (connection === 'open') {
                await sock.sendMessage(remitente, { text: "✅ Conexión establecida. La sub-instancia ya está operando y escuchando comandos." });
            }
        });

        // Carga y mapeo de los mismos plugins que usa la instancia principal
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

        // Motor de escucha para la sub-instancia
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
                        // Sincroniza la DB global para que los datos del clon se guarden
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
