import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

const TIMEOUT_MS = 30_000;

export default {
    name: 'remini_hd',
    match: (text) => /^\.(remini|hd|enhance)$/i.test(text),

    execute: async ({ sock, remitente, msg, downloadContentFromMessage }) => {
        const user = global.db.data.users[msg.sender] || {};
        const idioma = user.language || 'es';

        let tradutor;
        try {
            const pathLang = path.join(process.cwd(), 'src', 'languages', `${idioma}.json`);
            const _translate = JSON.parse(fs.readFileSync(pathLang, 'utf8'));
            tradutor = _translate.plugins.herramientas_hd;
        } catch {
            tradutor = {
                texto1: '⚠️ Responde a una imagen o envía una con el comando.',
                texto2: ['❌ Formato no compatible', 'solo jpg/png'],
                texto3: '⏳ *Mejorando imagen con IA... espera unos segundos.*',
                texto4: '❌ Error: '
            };
        }

        try {
            const imageNode = findImageNode(msg);

            if (!imageNode) {
                return sock.sendMessage(remitente, { text: tradutor.texto1 }, { quoted: msg });
            }

            const mime = imageNode.mimetype || '';
            if (!/image\/(jpe?g|png)/.test(mime)) {
                return sock.sendMessage(
                    remitente,
                    { text: `${tradutor.texto2[0]} (${mime}) ${tradutor.texto2[1]}` },
                    { quoted: msg }
                );
            }

            await sock.sendMessage(remitente, { text: tradutor.texto3 }, { quoted: msg });

            const buffer = await downloadImage(imageNode, downloadContentFromMessage);
            const hdImageBuffer = await enhanceImage(buffer);

            await sock.sendMessage(
                remitente,
                { image: hdImageBuffer, caption: '✨ *Imagen mejorada con IA*' },
                { quoted: msg }
            );

        } catch (e) {
            console.error('[HD] Error:', e);
            const errorMessage = e.response?.data?.message || e.message || 'Error desconocido';
            await sock.sendMessage(remitente, { text: tradutor.texto4 + errorMessage }, { quoted: msg });
        }
    }
};

/**
 * Busca el nodo imageMessage en todas las variantes posibles de mensaje
 */
function findImageNode(msg) {
    const m = msg.message;
    if (!m) return null;

    if (m.imageMessage) return m.imageMessage;
    if (m.viewOnceMessage?.message?.imageMessage)
        return m.viewOnceMessage.message.imageMessage;
    if (m.viewOnceMessageV2?.message?.imageMessage)
        return m.viewOnceMessageV2.message.imageMessage;
    if (m.viewOnceMessageV2Extension?.message?.imageMessage)
        return m.viewOnceMessageV2Extension.message.imageMessage;

    const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
        if (quoted.imageMessage) return quoted.imageMessage;
        if (quoted.viewOnceMessage?.message?.imageMessage)
            return quoted.viewOnceMessage.message.imageMessage;
        if (quoted.viewOnceMessageV2?.message?.imageMessage)
            return quoted.viewOnceMessageV2.message.imageMessage;
        if (quoted.viewOnceMessageV2Extension?.message?.imageMessage)
            return quoted.viewOnceMessageV2Extension.message.imageMessage;
    }

    return null;
}

/**
 * Descarga la imagen desde WhatsApp
 */
async function downloadImage(imageNode, downloadContentFromMessage) {
    const stream = await downloadContentFromMessage(imageNode, 'image');
    const chunks = [];

    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });

    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) throw new Error('No se pudo descargar la imagen de WhatsApp.');
    return buffer;
}

/**
 * Mejora la imagen: primero intenta APIs externas, si fallan usa sharp local
 */
async function enhanceImage(buffer) {
    // 1. Intentar APIs externas
    try {
        const url = await uploadToCatbox(buffer);
        return await tryRemoteApis(url);
    } catch (err) {
        console.warn('[HD] APIs remotas fallaron, usando mejora local:', err.message);
    }

    // 2. Fallback: mejora local con sharp (siempre funciona)
    return await enhanceWithSharp(buffer);
}

/**
 * Prueba múltiples APIs externas de mejora
 */
async function tryRemoteApis(url) {
    const encoded = encodeURIComponent(url);

    const apis = [
        {
            name: 'Siputzx',
            url: `https://api.siputzx.my.id/api/tools/remini?url=${encoded}`,
            method: 'get'
        },
        {
            name: 'Ryzendesu',
            url: `https://api.ryzendesu.vip/api/ai/remini?url=${encoded}`,
            method: 'get'
        },
        {
            name: 'Nayan',
            url: `https://api.nayan.site/api/remini?url=${encoded}`,
            method: 'get'
        }
    ];

    for (const api of apis) {
        try {
            console.log(`[HD] Probando API: ${api.name}`);
            const { data, headers } = await axios.get(api.url, {
                responseType: 'arraybuffer',
                headers: { accept: 'image/*', 'User-Agent': 'Mozilla/5.0' },
                timeout: TIMEOUT_MS
            });

            const buf = Buffer.from(data);

            // Verificar que no esté vacío y sea imagen real
            if (buf.length < 1000) throw new Error('Respuesta demasiado pequeña');

            const ft = await fileTypeFromBuffer(buf);
            if (!ft || !ft.mime.startsWith('image/')) {
                throw new Error(`No es imagen válida, mime: ${ft?.mime ?? 'desconocido'}`);
            }

            // Verificar que sharp pueda abrirla (imagen no corrupta)
            const meta = await sharp(buf).metadata();
            if (!meta.width || !meta.height) throw new Error('Imagen corrupta o vacía');

            console.log(`[HD] ✅ ${api.name} OK (${meta.width}x${meta.height})`);
            return buf;

        } catch (err) {
            console.warn(`[HD] ❌ ${api.name} falló: ${err.message}`);
        }
    }

    throw new Error('Todas las APIs externas fallaron.');
}

/**
 * Mejora local con sharp: upscale 4x + nitidez + saturación + contraste
 */
async function enhanceWithSharp(buffer) {
    console.log('[HD] Aplicando mejora local con sharp...');

    const meta = await sharp(buffer).metadata();
    const newWidth = (meta.width || 800) * 4;
    const newHeight = (meta.height || 800) * 4;

    // Limitar a 4096px máximo para no generar archivos enormes
    const maxDim = 4096;
    const scale = Math.min(maxDim / newWidth, maxDim / newHeight, 1);
    const finalWidth = Math.round(newWidth * scale);
    const finalHeight = Math.round(newHeight * scale);

    const enhanced = await sharp(buffer)
        // Upscale con algoritmo lanczos (mejor calidad)
        .resize(finalWidth, finalHeight, {
            kernel: sharp.kernel.lanczos3,
            fit: 'fill'
        })
        // Nitidez: realza bordes y detalles finos
        .sharpen({
            sigma: 1.5,
            m1: 1.5,
            m2: 0.7,
            x1: 2,
            y2: 10,
            y3: 20
        })
        // Mejora de color y contraste
        .modulate({
            brightness: 1.05,
            saturation: 1.2
        })
        .linear(1.1, -(128 * 0.1)) // contraste
        .toFormat('jpeg', { quality: 95 })
        .toBuffer();

    console.log(`[HD] ✅ Sharp local OK (${finalWidth}x${finalHeight})`);
    return enhanced;
}

/**
 * Sube un buffer a Catbox.moe
 */
async function uploadToCatbox(buffer) {
    const ft = await fileTypeFromBuffer(buffer);
    if (!ft) throw new Error('No se pudo determinar el tipo de archivo.');

    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, {
        filename: `image.${ft.ext}`,
        contentType: ft.mime
    });

    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        timeout: TIMEOUT_MS
    });

    const url = typeof res.data === 'string' ? res.data.trim() : '';
    if (!url.startsWith('https://')) {
        throw new Error('Catbox no devolvió una URL válida: ' + url);
    }

    return url;
}
