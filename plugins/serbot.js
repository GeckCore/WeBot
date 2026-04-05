// plugins/serbot.js
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

global.subbots = global.subbots || new Map();

module.exports = {
    name: 'serbot',
    match: (text) => /^(serbot|bots)/i.test(text),
    execute: async (ctx) => {
        const { sock, remitente, textoLimpio, getMediaInfo, downloadContentFromMessage } = ctx;
        const match = textoLimpio.match(/^(serbot|bots)(?:\s+(.+))?$/i);
        const command = match[1].toLowerCase();
        const args = match[2] ? match[2].trim().split(' ') : [];

        // --- COMANDO: BOTS ---
        if (command === 'bots') {
            if (global.subbots.size === 0) {
                return sock.sendMessage(remitente, { text: "❌ No hay sub-bots activos." }, { linkPreview: false });
            }
            let lista = "🤖 *LISTA DE SUB-BOTS ACTIVOS*\n\n";
            let i = 1;
            for (const [jid, _] of global.subbots) {
                lista += `${i}. wa.me/${jid.split('@')[0]}\n`;
                i++;
            }
            lista += `\n*Total:* ${global.subbots.size} bot(s).`;
            return sock.sendMessage(remitente, { text: lista }, { linkPreview: false });
        }

        // --- COMANDO: SERBOT ---
        if (args.length === 0) {
            const menu = `⚙️ *SISTEMA SUB-BOT*\n\n1. *serbot qr*\n2. *serbot code <tu_numero>*\n\n_Ejemplo: serbot code 34600000000_`;
            return sock.sendMessage(remitente, { text: menu });
        }

        const method = args[0].toLowerCase();
        if (method !== 'qr' && method !== 'code') return;

        const subbotId = remitente.split('@')[0].split(':')[0];
        const authFolder = path.join(__dirname, `../auth_subbots/auth_${subbotId}`);
        
        if (!fs.existsSync(path.join(__dirname, '../auth_subbots'))) {
            fs.mkdirSync(path.join(__dirname, '../auth_subbots'));
        }

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Inicializando motor aislado..." });

        try {
            const { state, saveCreds } = await useMultiFileAuthState(authFolder);
            const { version } = await fetchLatestBaileysVersion();

            const subSock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }), 
                auth: state,
                printQRInTerminal: false,
                browser: Browsers.macOS('Desktop'), // Firma nativa oficial para evitar el estancamiento de sesión
                syncFullHistory: false,
                msgRetryCounterCache: new Map(), // VITAL: Evita que el handshake de WhatsApp se cuelgue
                getMessage: async (key) => {
                    return { conversation: 'sincronizando' }; // VITAL: Responde a la petición del móvil para avanzar
                }
            });

            subSock.ev.on('creds.update', saveCreds);

            // Generar código de vinculación
            if (method === 'code' && !subSock.authState.creds.registered) {
                const numeroTarget = args[1] ? args[1].replace(/[^0-9]/g, '') : subbotId;
                setTimeout(async () => {
                    try {
                        let code = await subSock.requestPairingCode(numeroTarget);
                        code = code?.match(/.{1,4}/g)?.join("-") || code; // Formatea el código a XXXX-XXXX
                        await sock.sendMessage(remitente, { text: `🔢 *CÓDIGO DE VINCULACIÓN:*\n\n*${code}*\n\nVe a WhatsApp > Dispositivos vinculados > Vincular con el número de teléfono.`, edit: statusMsg.key }, { linkPreview: false });
                    } catch (err) {
                        await sock.sendMessage(remitente, { text: `❌ Error al generar código: ${err.message}`, edit: statusMsg.key });
                    }
                }, 3000); 
            }

            subSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // Enviar QR como imagen directamente (Restaurado)
                if (qr && method === 'qr') {
                    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(qr)}&size=500`;
                    await sock.sendMessage(remitente, { 
                        image: { url: qrUrl }, 
                        caption: "📷 *ESCANEA ESTE QR*\n\nTienes 30 segundos antes de que caduque." 
                    }, { edit: statusMsg.key }).catch(()=>{});
                }

                if (connection === 'open') {
                    const realJid = subSock.user.id.split(':')[0] + '@s.whatsapp.net';
                    global.subbots.set(realJid, subSock);
                    await sock.sendMessage(remitente, { text: `✅ *CONEXIÓN ESTABLECIDA*\n\nEl número ${realJid.split('@')[0]} es ahora un sub-bot activo.` });
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    global.subbots.delete(subSock.user?.id?.split(':')[0] + '@s.whatsapp.net');
                    
                    // 401 = Sesión cerrada desde el móvil. 403 = Baneado/Desvinculado por WhatsApp.
                    if (statusCode === 401 || statusCode === 403) {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                        await sock.sendMessage(remitente, { text: "⚠️ Sesión cerrada. Los archivos de vinculación han sido eliminados." }).catch(()=>{});
                    }
                }
            });

            // Motor de plugins aislado
            subSock.ev.on('messages.upsert', async (m) => {
                try {
                    const msgSub = m.messages[0];
                    if (!msgSub.message || msgSub.key.fromMe || msgSub.key.remoteJid === 'status@broadcast') return;

                    const msgTime = Number(msgSub.messageTimestamp);
                    const now = Math.floor(Date.now() / 1000);
                    if (now - msgTime > 15) return; 

                    const textoSub = msgSub.message.conversation || msgSub.message.extendedTextMessage?.text || "";
                    const textoLimpioSub = textoSub.trim();
                    if (!textoLimpioSub) return;

                    const pluginsDir = path.join(__dirname, '../plugins');
                    if (!fs.existsSync(pluginsDir)) return;
                    const plugins = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js')).map(file => require(path.join(pluginsDir, file)));

                    const subCtx = {
                        sock: subSock,
                        msg: msgSub,
                        remitente: msgSub.key.remoteJid,
                        textoLimpio: textoLimpioSub,
                        fromMe: false,
                        getMediaInfo,
                        downloadContentFromMessage,
                        quoted: msgSub.message.extendedTextMessage?.contextInfo?.quotedMessage,
                        msgType: Object.keys(msgSub.message)[0]
                    };

                    for (const plugin of plugins) {
                        if (plugin.name === 'serbot') continue; 
                        
                        if (plugin.match && plugin.match(textoLimpioSub, subCtx)) {
                            await plugin.execute(subCtx);
                            break;
                        }
                    }
                } catch (err) {
                    // Previene que Sharp o cualquier fallo tumbe el proceso
                }
            });

        } catch (error) {
            await sock.sendMessage(remitente, { text: `❌ Fallo interno de despliegue: ${error.message}` });
        }
    }
};
