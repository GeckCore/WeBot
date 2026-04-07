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
                browser: ['Sub-Bot (VPS)', 'Chrome', '1.0.0'],
                syncFullHistory: false,
                markOnline: false, // Evita conflictos de presencia que causan el error 479
                defaultQueryTimeoutMs: undefined,
                getMessage: async (key) => ({ conversation: 'Sub-bot system' })
            });

            let qrSent = false;
            let qrMsg = null;
            let isClosed = false;

            subSock.ev.on('creds.update', saveCreds);

            subSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // --- MANEJO DE QR (Sin Sharp) ---
                if (qr) {
                    try {
                        const qrBuffer = await QRCode.toBuffer(qr);
                        const caption = '🤳 *¡CONVIÉRTETE EN BOT!* 🤳\n\nEscanea este código QR para vincular tu número a la VPS.\n\n*Nota:* Si el código falla, asegúrate de no tener muchas sesiones activas.';
                        
                        if (!qrSent) {
                            // Enviamos con thumbnail vacío para evitar el error de "unsupported image format" de Sharp
                            qrMsg = await sock.sendMessage(remitente, { 
                                image: qrBuffer, 
                                caption,
                                thumbnail: Buffer.alloc(0) 
                            }, { quoted: msg });
                            qrSent = true;
                        } else {
                            // Enviar uno nuevo si el anterior caduca
                            await sock.sendMessage(remitente, { 
                                image: qrBuffer, 
                                caption,
                                thumbnail: Buffer.alloc(0)
                            }, { quoted: msg });
                        }
                    } catch (e) {
                        console.error('Error al enviar QR:', e);
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
                    
                    console.log(`[SUB-BOT] Sesión abierta por ${userNumber}`);
                }

                if (connection === 'close') {
                    isClosed = true;
                    const code = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconocida';
                    
                    // Si el error es 401 (Unauthorized), es un logout real
                    const isLogout = code === 401;

                    console.log(`[SUB-BOT] Conexión cerrada para ${userNumber}. Razón: ${reason} (${code})`);

                    const index = global.conns.indexOf(subSock);
                    if (index > -1) global.conns.splice(index, 1);

                    if (!isLogout) {
                        console.log(`[SUB-BOT] Reintentando conexión para ${userNumber} en 5 segundos...`);
                        setTimeout(() => startSubBot(), 5000);
                    } else {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                        await sock.sendMessage(remitente, { text: '❌ Sesión cerrada permanentemente. Los archivos de sesión han sido eliminados.' });
                    }
                }
            });

            subSock.ev.on('messages.upsert', async (m) => {
                // Aquí podrías vincular tu manejador principal si quieres que el sub-bot responda comandos
            });
        }

        startSubBot().catch(err => {
            console.error('Error en el proceso del Sub-Bot:', err);
            sock.sendMessage(remitente, { text: '❌ No se pudo iniciar el proceso de vinculación.' });
        });
    }
};
