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
        try { if (!isWindows) fs.chmodSync(binPath, '755'); } 
        catch (err) { console.error(`[ERROR] Permisos ${fileName}:`, err.message); }
    } else {
        console.error(`[CRÍTICO] Falta binario: "${fileName}".`);
    }
});

// --- CREACIÓN FORZADA DE CARPETAS DE CACHÉ ---
const pluginsDir = path.join(__dirname, 'plugins');
const cacheDir = path.join(__dirname, 'data/viewonce');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

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
            console.log('[INFO] Reconectando...');
            iniciarBot();
        } else if (connection === 'open') {
            console.log(`[INFO] ¡Conectado! (${plugins.length} plugins cargados)`);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        
        // --- LOGGER GLOBAL (DEBUGGER) ---
        // Esto es exactamente lo que sugeriste. Imprimirá las "llaves" del JSON que manda WhatsApp.
        const llavesInternas = Object.keys(msg.message).join(', ');
        console.log(`[LOG] Msj de: ${remitente.split('@')[0]} | Estructura: ${llavesInternas}`);

        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();

        let actualMsg = msg.message;
        let isViewOnce = false;

        // Bypass Ephemeral
        if (actualMsg?.ephemeralMessage) actualMsg = actualMsg.ephemeralMessage.message;

        // Bypass ViewOnce Containers
        if (actualMsg?.viewOnceMessageV2) {
            actualMsg = actualMsg.viewOnceMessageV2.message;
            isViewOnce = true;
        } else if (actualMsg?.viewOnceMessageV2Extension) {
            actualMsg = actualMsg.viewOnceMessageV2Extension.message;
            isViewOnce = true;
        } else if (actualMsg?.viewOnceMessage) {
            actualMsg = actualMsg.viewOnceMessage.message;
            isViewOnce = true;
        }

        const mediaType = Object.keys(actualMsg || {}).find(k => ['videoMessage', 'imageMessage', 'audioMessage', 'documentMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        // --- EXTRACCIÓN AL DISCO ---
        if (isViewOnce && mediaType) {
            console.log(`[SISTEMA] 👁️ Procesando ViewOnce interno de tipo: ${mediaType}`);
            
            const mediaData = actualMsg[mediaType];
            try {
                const downloadType = mediaType.replace('Message', ''); 
                const stream = await downloadContentFromMessage(mediaData, downloadType);
                
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                
                const ext = mediaType === 'imageMessage' ? 'jpg' : mediaType === 'videoMessage' ? 'mp4' : 'ogg';
                const filePath = path.join(cacheDir, `${msg.key.id}.${ext}`);
                fs.writeFileSync(filePath, buffer);
                
                console.log(`[SISTEMA] ✅ Guardado exitoso: ${msg.key.id}.${ext}`);
                
                setTimeout(() => {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }, 7200000);
            } catch (e) {
                console.error(`[ERROR] Fallo al descargar el stream:`, e.message);
            }
        }

        if (!textoLimpio && !mediaType && !isViewOnce) return;

        const ctx = { sock, msg, remitente, textoLimpio, fromMe, downloadContentFromMessage, quoted, msgType: mediaType };

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

console.log("Iniciando motor modular...");
iniciarBot();
