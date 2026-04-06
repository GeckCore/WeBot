const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuración de Consola Interactiva
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver));

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
        version, 
        auth: state, 
        printQRInTerminal: false, 
        // Cambiamos el browser para simular un cliente de escritorio/móvil más permisivo
        browser: ['Mac OS', 'Safari', '14.0.0'], 
        syncFullHistory: false
    });

    // Lógica de Vinculación (QR vs Pairing Code)
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            console.log("\n===========================================");
            const opcion = await question("[SISTEMA] Selecciona método de conexión:\n1. Código QR (Seguro)\n2. Código de 8 dígitos (Necesario para Anti-ViewOnce)\n> ");
            
            if (opcion === '2') {
                const numero = await question("\n[SISTEMA] Ingresa el número del bot con código de país (Ej: 34600000000):\n> ");
                const numeroLimpio = numero.replace(/[^0-9]/g, '');
                
                try {
                    const code = await sock.requestPairingCode(numeroLimpio);
                    console.log(`\n===========================================`);
                    console.log(`[SISTEMA] TU CÓDIGO DE VINCULACIÓN ES: ${code.match(/.{1,4}/g).join('-')}`);
                    console.log(`===========================================\n`);
                } catch (e) {
                    console.error("[ERROR] No se pudo generar el código:", e.message);
                }
            } else {
                sock.ev.on('connection.update', (update) => {
                    if (update.qr) {
                        console.log("\n[SISTEMA] Escanea este QR con WhatsApp:");
                        qrcode.generate(update.qr, { small: true });
                    }
                });
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (up) => {
        if (up.connection === 'open') console.log(`[INFO] Bot Online: ${plugins.length} plugins activos.`);
        if (up.connection === 'close') iniciarBot();
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const remitente = msg.key.remoteJid;
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpio = texto.trim();

        // Extraer mensaje citado y verificar si es efímero
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
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
