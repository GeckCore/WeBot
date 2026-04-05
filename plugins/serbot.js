// plugins/serbot.js
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

global.subbots = global.subbots || new Map();

module.exports = {
    name: 'serbot',
    match: (text) => /^(serbot|bots)/i.test(text),
    execute: async (ctx) => {
        const { sock, remitente, textoLimpio, msg, getMediaInfo } = ctx;
        const match = textoLimpio.match(/^(serbot|bots)(?:\s+(.+))?$/i);
        const command = match[1].toLowerCase();
        const args = match[2] ? match[2].trim().split(' ') : [];

        if (command === 'bots') {
            if (global.subbots.size === 0) {
                return sock.sendMessage(remitente, { text: "❌ No hay sub-bots activos." });
            }
            let lista = "🤖 *LISTA DE SUB-BOTS ACTIVOS*\n\n";
            let i = 1;
            for (const [jid, _] of global.subbots) {
                lista += `${i}. wa.me/${jid.split('@')[0]}\n`;
                i++;
            }
            lista += `\n*Total:* ${global.subbots.size} bot(s).`;
            return sock.sendMessage(remitente, { text: lista });
        }

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
                logger: pino({ level: 'silent' }), // Aislamiento vital para evitar el error decodeFrame
                auth: state,
                printQRInTerminal: false,
                browser: ['Ubuntu', 'Chrome', '122.0.0.0'], // Firma estandarizada inofensiva
                syncFullHistory: false,
                markOnlineOnConnect: true
            });

            subSock.ev.on('creds.update', saveCreds);

            if (method === 'code' && !subSock.authState.creds.registered) {
                const numeroTarget = args[1] ? args[1].replace(/[^0-9]/g, '') : subbotId;
                // Retraso ampliado a 3000ms para asegurar que el WebSocket está listo antes de pedir código
                setTimeout(async () => {
                    try {
                        const code = await subSock.requestPairingCode(numeroTarget);
                        await sock.sendMessage(remitente, { text: `🔢 *CÓDIGO:*\n\n*${code}*\n\nVe a WhatsApp > Dispositivos vinculados.`, edit: statusMsg.key });
                    } catch (err) {
                        await sock.sendMessage(remitente, { text: `❌ Error al pedir código: ${err.message}`, edit: statusMsg.key });
                    }
                }, 3000); 
            }

            subSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && method === 'qr') {
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`;
                    await sock.sendMessage(remitente, { 
                        image: { url: qrUrl }, 
                        caption: "📷 *ESCANEA ESTE QR*\n\nTienes 30 segundos." 
                    }, { edit: statusMsg.key });
                }

                if (connection === 'open') {
                    const realJid = subSock.user.id.split(':')[0] + '@s.whatsapp.net';
                    global.subbots.set(realJid, subSock);
                    await sock.sendMessage(remitente, { text: `✅ *CONEXIÓN ESTABLECIDA*\n\nEl número ${realJid.split('@')[0]} es un sub-bot activo.` });
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    global.subbots.delete(subSock.user?.id?.split(':')[0] + '@s.whatsapp.net');
                    
                    // 401 = Sesión cerrada del móvil. 515 = Stream Errored (Bucle corrupto)
                    if (statusCode === 401 || statusCode === 515) {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                        await sock.sendMessage(remitente, { text: "⚠️ Sesión corrupta o cerrada. Caché limpiada, puedes iniciar el proceso de nuevo de forma segura." });
                    }
                }
            });

            subSock.ev.on('messages.upsert', async (m) => {
                const msgSub = m.messages[0];
                if (!msgSub.message || msgSub.key.fromMe || msgSub.key.remoteJid === 'status@broadcast') return;

                const textoSub = msgSub.message.conversation || msgSub.message.extendedTextMessage?.text || "";
                const textoLimpioSub = textoSub.trim();
                if (!textoLimpioSub) return;

                const pluginsDir = path.join(__dirname, '../plugins');
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
                        try {
                            await plugin.execute(subCtx);
                        } catch (err) {
                            console.error(`[SUBBOT ERROR] ${err.message}`);
                        }
                        break;
                    }
                }
            });

        } catch (error) {
            await sock.sendMessage(remitente, { text: `❌ Fallo interno de conexión: ${error.message}` });
        }
    }
};
