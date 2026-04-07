import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser, Browsers } from '@whiskeysockets/baileys';
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

        // 1. Verificar si ya está conectado en esta instancia
        const existingConn = global.conns.find(c => c.user && (jidNormalizedUser(c.user.id) === jidNormalizedUser(userJid)));
        if (existingConn) {
            return sock.sendMessage(remitente, { text: '⚠️ Ya tienes una sesión activa o en proceso de conexión.' }, { quoted: msg });
        }

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        await sock.sendMessage(remitente, { text: '⏳ Preparando el entorno de sub-bot... Por favor, espera el QR.' }, { quoted: msg });

        async function startSubBot() {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            const subSock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.macOS('Desktop'),
                syncFullHistory: false,
                // FIX CRÍTICO 1: WhatsApp exige que el dispositivo esté online durante el emparejamiento 
                // para confirmar la recepción del historial inicial.
                markOnline: true, 
                getMessage: async (key) => {
                    return global.store?.loadMessage?.(key.remoteJid, key.id)?.message || undefined;
                }
            });

            subSock.ev.on('creds.update', saveCreds);

            subSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // --- MANEJO DE QR ---
                if (qr) {
                    try {
                        // FIX CRÍTICO 2: Forzar un buffer PNG estándar con margen y escala.
                        // Esto evita que 'sharp' lance "unsupported image format" y crashee el emparejamiento.
                        const qrBuffer = await QRCode.toBuffer(qr, { type: 'png', margin: 4, scale: 4 });
                        const caption = '🤳 *¡CONVIÉRTETE EN BOT!* 🤳\n\nEscanea este código QR para vincular tu número a la VPS.\n\n*Nota:* Este código se actualizará en unos segundos si no lo escaneas.';
                        
                        // Enviamos la imagen de forma limpia, sin modificar el thumbnail
                        await sock.sendMessage(remitente, { image: qrBuffer, caption }, { quoted: msg });
                    } catch (e) {
                        console.error('Error de Buffer al generar QR:', e);
                    }
                }

                // --- MANEJO DE CONEXIÓN ---
                if (connection === 'open') {
                    subSock.isSubBot = true;
                    subSock.uptime = Date.now();
                    if (!global.conns.includes(subSock)) global.conns.push(subSock);
                    
                    await sock.sendMessage(remitente, { 
                        text: `✅ *Sub-Bot Conectado con éxito.*\n\nNúmero: @${userNumber}\nYa puedes usar los comandos directamente desde tu número.`,
                        mentions: [userJid]
                    });
                    
                    console.log(`[SUB-BOT] Sesión estable abierta por ${userNumber}`);
                }

                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconocida';
                    
                    const isLogout = code === 401;

                    console.log(`[SUB-BOT] Conexión cerrada para ${userNumber}. Razón: ${reason} (${code})`);

                    const index = global.conns.indexOf(subSock);
                    if (index > -1) global.conns.splice(index, 1);

                    if (!isLogout) {
                        // FIX CRÍTICO 3: Eliminamos removeAllListeners() porque mataba el proceso de 
                        // guardado de credenciales durante la reconexión de emergencia.
                        console.log(`[SUB-BOT] Reintentando conexión para ${userNumber} en 5 segundos...`);
                        setTimeout(() => startSubBot(), 5000);
                    } else {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        await sock.sendMessage(remitente, { text: '❌ Sesión cerrada permanentemente desde el teléfono. Los archivos han sido eliminados.' });
                    }
                }
            });

            subSock.ev.on('messages.upsert', async (m) => {
                // Delegación de mensajes del sub-bot (Módulo preparativo)
            });
        }

        startSubBot().catch(err => {
            console.error('Error fatal en el proceso del Sub-Bot:', err);
            sock.sendMessage(remitente, { text: '❌ Fallo crítico al iniciar el sub-bot. Revisa la consola de la VPS.' });
        });
    }
};
