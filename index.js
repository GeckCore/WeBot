// index.js
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadMediaMessage, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PYTHON_API = 'http://127.0.0.1:5000/webhook';
const MI_NUMERO = '34682075812@s.whatsapp.net';

const colasMensajes = {};
const temporizadores = {};
const TIEMPO_ESPERA = 15000;

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
        version, auth: state, printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'], syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') iniciarBot();
        else if (connection === 'open') console.log('¡Conectado a WhatsApp!');
    });

    const getMediaInfo = (msgObj) => {
        if (!msgObj) return null;
        if (msgObj.videoMessage) return { type: 'video', msg: msgObj.videoMessage, ext: 'mp4' };
        if (msgObj.imageMessage) return { type: 'image', msg: msgObj.imageMessage, ext: 'jpg' };
        if (msgObj.audioMessage) return { type: 'audio', msg: msgObj.audioMessage, ext: 'ogg' };
        if (msgObj.documentMessage) return { type: 'document', msg: msgObj.documentMessage, ext: 'bin' };
        if (msgObj.documentWithCaptionMessage?.message?.documentMessage) return { type: 'document', msg: msgObj.documentWithCaptionMessage.message.documentMessage, ext: 'bin' };
        return null;
    };

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const remitente = msg.key.remoteJid;
        if (remitente.endsWith('@g.us') || remitente === 'status@broadcast') return;

        let texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        let base64Audio = "";
        const esAudio = !!msg.message.audioMessage;

        if (esAudio) {
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', { }, { logger: console });
                base64Audio = buffer.toString('base64');
            } catch (e) { return; }
        }

        if (!texto && !esAudio) return;

        const miJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const fromMe = msg.key.fromMe;
        const esAprendizajeForzado = texto.toLowerCase().startsWith('!aprende ');
        const esChatConmigoMismo = (remitente === miJid || remitente === MI_NUMERO);
        const esRespuestaMia = fromMe && !esChatConmigoMismo && !esAprendizajeForzado;
        const textoLimpio = esAprendizajeForzado ? texto.substring(9).trim() : texto;

        const cancelarCola = () => {
            if (temporizadores[remitente]) {
                clearTimeout(temporizadores[remitente]);
                delete temporizadores[remitente];
                delete colasMensajes[remitente];
            }
        };

        const ctx = {
            sock, msg, remitente, textoLimpio, fromMe, base64Audio, esRespuestaMia,
            esChatConmigoMismo, esAprendizajeForzado, getMediaInfo, cancelarCola, PYTHON_API, axios, downloadContentFromMessage,
            quoted: msg.message.extendedTextMessage?.contextInfo?.quotedMessage,
            msgType: Object.keys(msg.message).find(k => ['videoMessage', 'imageMessage', 'documentMessage', 'audioMessage'].includes(k))
        };

        // 1. Ejecutar sistema de Plugins
        let pluginConsumido = false;
        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                cancelarCola();
                try {
                    await plugin.execute(ctx);
                } catch (err) {
                    await sock.sendMessage(remitente, { text: `❌ Error interno (${plugin.name}): ${err.message}` });
                }
                pluginConsumido = true;
                break;
            }
        }
        if (pluginConsumido) return;

        // 2. Control manual (Evita que la IA responda por ti)
        if (esRespuestaMia) {
            cancelarCola();
            try {
                await axios.post(PYTHON_API, { remitente, mensaje: textoLimpio, audio_b64: base64Audio, es_mio: false, es_respuesta_mia: true, modelo: "qwen2.5:14b" });
            } catch (e) {}
            return;
        }

        if (fromMe && !esChatConmigoMismo && !esAprendizajeForzado) return;

        // 3. Sistema de colas IA Local (Qwen)
        if (!colasMensajes[remitente]) colasMensajes[remitente] = [];
        colasMensajes[remitente].push({ texto: textoLimpio, audio: base64Audio });

        if (temporizadores[remitente]) clearTimeout(temporizadores[remitente]);

        temporizadores[remitente] = setTimeout(async () => {
            const acumulado = colasMensajes[remitente];
            delete colasMensajes[remitente];
            delete temporizadores[remitente];

            const textoAgrupado = acumulado.map(m => m.texto).filter(t => t).join('\n');
            const audioFinal = acumulado.find(m => m.audio)?.audio || ""; 

            console.log(`[←] ${remitente.split('@')[0]}: ${audioFinal ? '[AUDIO] ' : ''}${textoAgrupado}`);

            try {
                const res = await axios.post(PYTHON_API, {
                    remitente, mensaje: textoAgrupado, audio_b64: audioFinal, es_mio: esChatConmigoMismo || esAprendizajeForzado, es_respuesta_mia: false, modelo: "qwen2.5:14b"
                });

                const respuestaIA = res.data.respuesta;
                if (!respuestaIA) return;

                if (!esChatConmigoMismo && !esAprendizajeForzado) {
                    await new Promise(r => setTimeout(r, res.data.delay_ms || 1200));
                    await sock.sendPresenceUpdate('composing', remitente);
                    await new Promise(r => setTimeout(r, Math.min(respuestaIA.length * 60, 3000)));
                    await sock.sendPresenceUpdate('paused', remitente);
                }

                await sock.sendMessage(remitente, { text: respuestaIA });
                console.log(`[→] IA: ${respuestaIA}`);

            } catch (error) {
                if (error.code === 'ECONNREFUSED') console.log(`[⚠] Python apagado para ${remitente.split('@')[0]}`);
            }
        }, TIEMPO_ESPERA);
    });
}

iniciarBot();
