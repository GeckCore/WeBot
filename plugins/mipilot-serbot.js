import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser, makeCacheableSignalKeyStore, delay } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

if (!global.conns) global.conns = [];

export default {
    name: 'mipilot_jadibot',
    // Captura los tres comandos adaptados
    match: (text) => /^\.(jadibot|serbot|botclone|txbot|getcode|code)(\s+.*)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        const textParams = args.slice(1).join(' ');

        const userJid = msg.sender || remitente;
        const userNumber = userJid.split('@')[0];
        const sessionPath = path.join(process.cwd(), 'jadibts', userNumber);

        // ==========================================
        // 1. COMANDO TXBOT (Broadcast a Sub-Bots)
        // ==========================================
        if (command === 'txbot') {
            if (jidNormalizedUser(sock.user.id) !== jidNormalizedUser(userJid)) {
                return sock.sendMessage(remitente, { text: '❌ Este comando es exclusivo del Bot Principal.' }, { quoted: msg });
            }

            if (!textParams) {
                return sock.sendMessage(remitente, { text: '⚠️ Escribe el mensaje a transmitir.\nEjemplo: `.txbot Reinicio programado en 5 min.`' }, { quoted: msg });
            }

            const activeSubBots = global.conns.filter(c => c.user).map(c => jidNormalizedUser(c.user.id));
            const uniqueSubBots = [...new Set(activeSubBots)];

            if (uniqueSubBots.length === 0) {
                return sock.sendMessage(remitente, { text: '❌ No hay Sub-Bots conectados en este momento.' }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { text: `⏳ *Transmitiendo a ${uniqueSubBots.length} Sub-Bots...*` }, { quoted: msg });

            const broadcastMsg = `📢 *COMUNICADO DEL BOT PRINCIPAL*\n────────────────────\n\n${textParams}`;

            for (const jid of uniqueSubBots) {
                await delay(1500); 
                await sock.sendMessage(jid, { text: broadcastMsg });
            }

            return sock.sendMessage(remitente, { text: '✅ Transmisión finalizada con éxito.' }, { quoted: msg });
        }

        // ==========================================
        // 2. COMANDO GETCODE (Estado de la Sesión)
        // ==========================================
        if (command === 'getcode' || command === 'code') {
            const credsPath = path.join(sessionPath, 'creds.json');
            
            if (!fs.existsSync(credsPath)) {
                return sock.sendMessage(remitente, { text: `❌ Aún no eres Sub-Bot.\n\nUsa: *.botclone* para vincularte.` }, { quoted: msg });
            }

            const txt = `
┌─⊷  🤖 *TU SUB-BOT*
▢ 👤 *Número:* wa.me/${userNumber}
▢ 📂 *Carpeta:* jadibts/${userNumber}
▢ 🟢 *Estado:* Activo / Guardado
└──────────────`.trim();

            return sock.sendMessage(remitente, { text: txt }, { quoted: msg });
        }

        // ==========================================
        // 3. COMANDO BOTCLONE / JADIBOT (Pairing Code)
        // ==========================================
        if (['jadibot', 'serbot', 'botclone'].includes(command)) {
            const existingConn = global.conns.find(c => c.user && (jidNormalizedUser(c.user.id) === jidNormalizedUser(userJid)));
            if (existingConn) {
                return sock.sendMessage(remitente, { text: '⚠️ Ya tienes una sesión activa conectada a esta VPS.' }, { quoted: msg });
            }

            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            await sock.sendMessage(remitente, { text: '⏳ Preparando la encriptación y solicitando código a Meta...' }, { quoted: msg });

            async function startSubBot() {
                const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
                const { version } = await fetchLatestBaileysVersion();

                const subSock = makeWASocket({
                    version,
                    auth: {
                        creds: state.creds,
                        // FIX CRÍTICO: Caché de llaves para evitar que el código falle por timeout criptográfico
                        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
                    },
                    logger: pino({ level: 'silent' }),
                    printQRInTerminal: false,
                    // FIX CRÍTICO: Debe ser idéntico al bot principal para evitar rechazo de Meta
                    browser: ['Ubuntu', 'Chrome', '122.0.0.0'], 
                    syncFullHistory: false,
                    markOnlineOnConnect: true,
                    getMessage: async (key) => {
                        return global.store?.loadMessage?.(key.remoteJid, key.id)?.message || undefined;
                    }
                });

                subSock.ev.on('creds.update', saveCreds);

                // --- GENERACIÓN DEL PAIRING CODE ---
                if (!subSock.authState.creds.registered) {
                    // Esperar 4 segundos (aumentado) para asegurar que el socket está 100% abierto antes de pedir el código
                    setTimeout(async () => {
                        try {
                            const cleanNumber = userNumber.replace(/[^0-9]/g, '');
                            let codeBot = await subSock.requestPairingCode(cleanNumber);
                            codeBot = codeBot?.match(/.{1,4}/g)?.join("-") || codeBot;

                            const instruction = `➤ *CÓDIGO DE VINCULACIÓN*\n\n*${codeBot}*\n\n1. Abre tu WhatsApp\n2. Toca en el Menú ⋮ o Configuración\n3. Dispositivos vinculados\n4. Vincular con número de teléfono\n5. Introduce este código de 8 letras.\n\n_⚠️ Tienes 30 segundos antes de que el código expire por seguridad de Meta._`;

                            await sock.sendMessage(remitente, { text: instruction }, { quoted: msg });
                        } catch (e) {
                            console.error("Error generando pairing code:", e);
                            sock.sendMessage(remitente, { text: '❌ Error técnico al solicitar el código a Meta. Si has intentado mucho, espera 1 hora por el límite de WhatsApp.' });
                            // Borrar sesión corrupta para evitar bucles
                            try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (err) {}
                        }
                    }, 4000);
                }

                // --- MANEJO DE CONEXIÓN DEL SUB-BOT ---
                subSock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect } = update;

                    if (connection === 'open') {
                        subSock.isSubBot = true;
                        subSock.uptime = Date.now();
                        if (!global.conns.includes(subSock)) global.conns.push(subSock);
                        
                        await sock.sendMessage(remitente, { 
                            text: `✅ *Sub-Bot Conectado con éxito.*\n\nNúmero: @${userNumber}\nTu bot ya está operativo.`,
                            mentions: [userJid]
                        });
                        
                        console.log(`[SUB-BOT] Sesión estable abierta por ${userNumber}`);
                    }

                    if (connection === 'close') {
                        const code = lastDisconnect?.error?.output?.statusCode;
                        const reason = lastDisconnect?.error?.output?.payload?.message || 'Desconocida';
                        const isLogout = code === 401; // 401 = Sesión cerrada desde el móvil

                        console.log(`[SUB-BOT] Conexión cerrada para ${userNumber}. Razón: ${reason} (${code})`);

                        const index = global.conns.indexOf(subSock);
                        if (index > -1) global.conns.splice(index, 1);

                        if (!isLogout && code !== 405) { // 405 a veces ocurre si Meta rechaza el código
                            console.log(`[SUB-BOT] Reintentando conexión para ${userNumber} en 5 segundos...`);
                            setTimeout(() => startSubBot(), 5000);
                        } else {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                            if (isLogout) {
                                await sock.sendMessage(remitente, { text: '❌ Has cerrado la sesión desde tu WhatsApp o el código expiró. Tu Sub-Bot ha sido eliminado de la VPS.' });
                            }
                        }
                    }
                });

                subSock.ev.on('messages.upsert', async (m) => {
                    // Delegación de comandos futuros
                });
            }

            startSubBot().catch(err => {
                console.error('Error fatal iniciando Sub-Bot:', err);
                sock.sendMessage(remitente, { text: '❌ Fallo crítico al iniciar el sub-bot. Revisa la consola.' });
            });
        }
    }
};
