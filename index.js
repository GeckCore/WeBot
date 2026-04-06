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

// --- CACHÉ LIGERA EN RAM (Reemplazo optimizado del 'Store' de The Mystic) ---
global.efimerosCache = new Map();

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version: version || [2, 3000, 1033893291], // Fallback a la versión de Mystic
        auth: state, 
        printQRInTerminal: false,
        // Bypass de User-Agent idéntico a The Mystic para evitar el bloqueo de Meta
        browser: ['Ubuntu', 'Chrome', '20.0.04'], 
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (up) => {
        if (up.qr) qrcode.generate(up.qr, { small: true });
        if (up.connection === 'open') console.log(`[INFO] Sistema Online: ${plugins.length} plugins cargados.`);
        if (up.connection === 'close') iniciarBot();
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();

        // --- INTERCEPTOR DE CLAVES (MEDIAKEY) ---
        // Desenvolvemos el mensaje en caso de que el grupo tenga mensajes temporales
        let baseMsg = msg.message?.ephemeralMessage?.message || msg.message;
        let viewOnceData = baseMsg?.viewOnceMessageV2 || baseMsg?.viewOnceMessage || baseMsg?.viewOnceMessageV2Extension;

        if (viewOnceData) {
            // Guardamos el objeto interno (que contiene la mediaKey) en la RAM
            global.efimerosCache.set(msg.key.id, viewOnceData.message);
            console.log(`[SISTEMA] 👁️ Efímero interceptado y guardado en RAM: ID ${msg.key.id}`);
            
            // Auto-borrado a las 2 horas para liberar RAM de la VPS
            setTimeout(() => {
                global.efimerosCache.delete(msg.key.id);
            }, 7200000);
        }

        const ctx = { sock, msg, remitente, textoLimpio };

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
