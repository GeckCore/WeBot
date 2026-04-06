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

// Caché en RAM para máximo rendimiento
global.efimerosCache = new Map();

// Buscador recursivo: Escanea todas las capas del JSON buscando el ViewOnce
function findViewOnce(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.viewOnceMessage) return obj.viewOnceMessage.message;
    if (obj.viewOnceMessageV2) return obj.viewOnceMessageV2.message;
    if (obj.viewOnceMessageV2Extension) return obj.viewOnceMessageV2Extension.message;
    
    for (const key in obj) {
        const result = findViewOnce(obj[key]);
        if (result) return result;
    }
    return null;
}

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version: version || [2, 3000, 1033893291],
        auth: state, 
        printQRInTerminal: false,
        // HUELLA DE DISPOSITIVO: Copiada de The Mystic para evitar bloqueo de Meta
        browser: ['TheMystic-Bot-MD', 'Safari', '2.0.0'], 
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

        // LOGGER ACTIVO: Verás cada mensaje que llegue en tiempo real
        if (!msg.key.fromMe) {
            const keys = Object.keys(msg.message).join(', ');
            console.log(`[LOG] Msj de: ${remitente.split('@')[0]} | Capa externa: ${keys}`);
        }

        // --- INTERCEPTOR RADAR ---
        const viewOnceData = findViewOnce(msg.message);

        if (viewOnceData) {
            global.efimerosCache.set(msg.key.id, viewOnceData);
            console.log(`[SISTEMA] 👁️ Efímero interceptado en RAM: ID ${msg.key.id}`);
            
            // Auto-borrado en 2 horas
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
