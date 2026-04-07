import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

if (!global.conns) global.conns = [];

export default {
    name: 'mipilot-serbot',
    match: (text) => /^\.(jadibot|serbot)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        const userJid = msg.sender || remitente;
        const userNumber = userJid.split('@')[0];
        const sessionPath = path.join(process.cwd(), 'jadibts', userNumber);

        // 1. Verificar si ya está conectado
        const existingConn = global.conns.find(c => c.user?.jid === userJid);
        if (existingConn) {
            return sock.sendMessage(remitente, { text: '⚠️ Ya tienes una sesión activa. Usa `.estado` para verificar.' }, { quoted: msg });
        }

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        // 2. Iniciar proceso de conexión
        await sock.sendMessage(remitente, { text: '⏳ Iniciando sesión de sub-bot... Espera el código QR.' }, { quoted: msg });

        async function startSubBot() {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            const subSock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: ['Sub-Bot (VPS)', 'Chrome', '1.0.0'],
                syncFullHistory: false,
                getMessage: async (key) => ({ conversation: 'Sub-bot message' })
            });

            let qrSent = false;
            let qrMsg = null;

            subSock.ev.on('creds.update', saveCreds);

            subSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // --- MANEJO DE QR ---
                if (qr) {
                    const qrBuffer = await QRCode.toBuffer(qr);
                    const caption = '🤳 *¡CONVIÉRTETE EN BOT!* 🤳\n\n1. Abre WhatsApp en tu teléfono.\n2. Ve a Dispositivos vinculados > Vincular un dispositivo.\n3. Escanea este código QR.\n\n*Nota:* Este QR caduca en 45 segundos.';
                    
                    if (!qrSent) {
                        qrMsg = await sock.sendMessage(remitente, { image: qrBuffer, caption }, { quoted: msg });
                        qrSent = true;
                    } else {
                        // Actualizar el mensaje anterior si es posible (Baileys no siempre lo permite con imágenes)
                        // Por simplicidad en esta versión, enviamos uno nuevo si el anterior caduca
                        await sock.sendMessage(remitente, { image: qrBuffer, caption }, { quoted: msg });
                    }
                }

                // --- MANEJO DE CONEXIÓN ---
                if (connection === 'open') {
                    subSock.isSubBot = true;
                    subSock.uptime = Date.now();
                    global.conns.push(subSock);
                    
                    await sock.sendMessage(remitente, { 
                        text: `✅ *¡Sub-Bot Conectado!*\n\nTu número @${userNumber} ahora es parte del sistema VPS.\nUsa \`.bots\` para ver la lista activa.`,
                        mentions: [userJid]
                    });
                    
                    console.log(`[SUB-BOT] Sesión abierta por ${userNumber}`);
                }

                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = code !== 401; // 401 = Logout manual

                    if (shouldReconnect) {
                        console.log(`[SUB-BOT] Reconectando sesión de ${userNumber}...`);
                        startSubBot();
                    } else {
                        console.log(`[SUB-BOT] Sesión cerrada permanentemente para ${userNumber}`);
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        const index = global.conns.indexOf(subSock);
                        if (index > -1) global.conns.splice(index, 1);
                        
                        await sock.sendMessage(remitente, { text: '❌ Sesión cerrada. Los archivos temporales han sido eliminados.' });
                    }
                }
            });

            // Lógica para procesar mensajes en el sub-bot (opcional)
            // Aquí podrías replicar el manejador de mensajes del index principal
            subSock.ev.on('messages.upsert', async (m) => {
                // El sub-bot puede responder comandos propios aquí si lo deseas
            });
        }

        startSubBot().catch(err => {
            console.error('Error fatal en JadiBot:', err);
            sock.sendMessage(remitente, { text: '❌ Error al intentar iniciar la sesión.' });
        });
    }
};
