const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];

binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);
    if (fs.existsSync(binPath)) {
        try { if (!isWindows) fs.chmodSync(binPath, '755'); } catch (e) {}
    }
});

const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js')).map(f => require(path.join(pluginsDir, f)));

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version, auth: state, printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '122.0.0.0'], syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (up) => {
        if (up.qr) qrcode.generate(up.qr, { small: true });
        if (up.connection === 'open') console.log(`[INFO] Bot Online: ${plugins.length} plugins.`);
        if (up.connection === 'close') iniciarBot();
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();

        // --- LÓGICA DE EXTRACCIÓN (ESTILO MYSTIC) ---
        // Buscamos el mensaje citado
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        
        // Si hay un citado, buscamos si dentro tiene un ViewOnce
        let quotedViewOnce = null;
        if (quoted) {
            quotedViewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessage || quoted.viewOnceMessageV2Extension;
        }

        const ctx = { 
            sock, msg, remitente, textoLimpio, 
            quoted: quotedViewOnce ? quotedViewOnce.message : quoted, 
            isViewOnce: !!quotedViewOnce,
            downloadContentFromMessage 
        };

        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                } catch (err) {
                    console.error(`Error en ${plugin.name}:`, err);
                }
                break;
            }
        }
    });
}
iniciarBot();
