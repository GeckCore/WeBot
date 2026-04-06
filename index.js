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
        // Detectar si el contenido está dentro de un ViewOnce o es normal
        const content = msgObj.viewOnceMessageV2?.message || msgObj.viewOnceMessage?.message || msgObj.viewOnceMessageV2Extension?.message || msgObj;
        
        if (content.videoMessage) return { type: 'video', msg: content.videoMessage, ext: 'mp4' };
        if (content.imageMessage) return { type: 'image', msg: content.imageMessage, ext: 'jpg' };
        if (content.audioMessage) return { type: 'audio', msg: content.audioMessage, ext: 'ogg' };
        if (content.documentMessage) return { type: 'document', msg: content.documentMessage, ext: 'bin' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();
        
        // --- DETECCIÓN MEJORADA DE TIPOS ---
        const viewOnce = msg.message.viewOnceMessageV2 || msg.message.viewOnceMessage || msg.message.viewOnceMessageV2Extension;
        const actualMsg = viewOnce ? viewOnce.message : msg.message;
        const msgType = Object.keys(actualMsg).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k));
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;

        // --- INTERCEPTOR DE EFÍMEROS (CACHÉ LOCAL) ---
        if (viewOnce) {
            const type = Object.keys(viewOnce.message)[0];
            const mediaData = viewOnce.message[type];
            const folder = path.join(__dirname, 'data/viewonce');
            
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

            try {
                const stream = await downloadContentFromMessage(
                    mediaData, 
                    type === 'imageMessage' ? 'image' : type === 'videoMessage' ? 'video' : 'audio'
                );
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                
                const filePath = path.join(folder, `${msg.key.id}.bin`);
                fs.writeFileSync(filePath, buffer);
                
                // Auto-borrado en 2 horas para optimizar espacio en VPS
                setTimeout(() => {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }, 7200000);
                
            } catch (e) {
                console.error(`[ERROR] No se pudo cachear efímero ${msg.key.id}`);
            }
        }

        if (!textoLimpio && !msgType && !viewOnce) return;

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
