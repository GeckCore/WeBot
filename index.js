const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- OPTIMIZACIÓN DE ARRANQUE: PERMISOS Y VERIFICACIÓN DE BINARIOS ---
const isWindows = process.platform === 'win32';
const binarios = ['yt-dlp', 'ffmpeg'];

binarios.forEach(bin => {
    const fileName = isWindows ? `${bin}.exe` : bin;
    const binPath = path.join(__dirname, fileName);

    if (fs.existsSync(binPath)) {
        try {
            if (!isWindows) {
                fs.chmodSync(binPath, '755');
                console.log(`[INFO] Permisos de ${fileName} configurados (chmod +x).`);
            } else {
                console.log(`[INFO] Binario ${fileName} detectado en Windows.`);
            }
        } catch (err) {
            console.error(`[ERROR] No se pudieron aplicar permisos a ${fileName}:`, err.message);
        }
    } else {
        console.error(`[CRÍTICO] Falta el binario: "${fileName}" en la raíz (${__dirname}). El bot tendrá funciones limitadas.`);
    }
});

// Cargar plugins dinámicamente
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
const plugins = fs.readdirSync(pluginsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => require(path.join(pluginsDir, file)));

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[INFO] Versión WA Web: ${version.join('.')} (Última: ${isLatest})`);

    const sock = makeWASocket({
        version, 
        auth: state, 
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '122.0.0.0'], 
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            console.log('[INFO] Conexión cerrada. Reconectando...');
            iniciarBot();
        } else if (connection === 'open') {
            console.log(`[INFO] ¡Conectado a WhatsApp! (${plugins.length} plugins cargados)`);
        }
    });

    const getMediaInfo = (msgObj) => {
        if (!msgObj) return null;
        if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
        if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
        if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
        if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
        if (msgObj.documentWithCaptionMessage?.message?.documentMessage) {
            return { type: 'document', msg: msgObj.documentWithCaptionMessage.message.documentMessage, ext: 'bin' };
        }
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        const msgType = Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!textoLimpio && !msgType) return;

        const ctx = { sock, msg, remitente, textoLimpio, fromMe, getMediaInfo, downloadContentFromMessage, quoted, msgType };

        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                } catch (err) {
                    console.error(`Error en plugin ${plugin.name}:`, err);
                    await sock.sendMessage(remitente, { text: `❌ Error interno (${plugin.name}): ${err.message}` });
                }
                break;
            }
        }
    });
}

console.log("Iniciando motor modular...");
iniciarBot();
