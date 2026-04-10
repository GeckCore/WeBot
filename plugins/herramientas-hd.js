import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { fileTypeFromBuffer } from 'file-type';

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
                texto3: '⏳ *Procesando imagen... esto puede tardar unos segundos.*',
                texto4: '❌ Error: '
            };
        }

        try {
            // Detección robusta de imagen en todos los tipos de mensaje
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

            // Descargar imagen
            const buffer = await downloadImage(imageNode, downloadContentFromMessage);

            // Subir a Catbox
            const imageUrl = await uploadToCatbox(buffer);

            // Mejorar imagen con IA
            const hdImageBuffer = await upscaleImage(imageUrl);

            // Enviar resultado
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

    // Imagen directa (con o sin caption)
    if (m.imageMessage) return m.imageMessage;

    // Imagen efímera v1
    if (m.viewOnceMessage?.message?.imageMessage)
        return m.viewOnceMessage.message.imageMessage;

    // Imagen efímera v2
    if (m.viewOnceMessageV2?.message?.imageMessage)
        return m.viewOnceMessageV2.message.imageMessage;

    // Imagen efímera v2 extension
    if (m.viewOnceMessageV2Extension?.message?.imageMessage)
        return m.viewOnceMessageV2Extension.message.imageMessage;

    // Mensaje citado (texto extendido con imagen adjunta)
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
 * Descarga la imagen desde WhatsApp con manejo de errores
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

/**
 * Mejora la imagen con IA usando dos APIs de respaldo
 */
async function upscaleImage(url) {
    const apis = [
        `https://api.siputzx.my.id/api/tools/remini?url=${encodeURIComponent(url)}`,
        `https://api.ryzendesu.vip/api/ai/remini?url=${encodeURIComponent(url)}`
    ];

    let lastError;
    for (const [i, endpoint] of apis.entries()) {
        try {
            const { data } = await axios.get(endpoint, {
                responseType: 'arraybuffer',
                headers: { accept: 'image/*', 'User-Agent': 'Mozilla/5.0' },
                timeout: TIMEOUT_MS
            });

            // Verificar que la respuesta sea realmente una imagen
            const buf = Buffer.from(data);
            const ft = await fileTypeFromBuffer(buf);
            if (!ft || !ft.mime.startsWith('image/')) {
                throw new Error('La API no devolvió una imagen válida.');
            }

            return buf;
        } catch (err) {
            console.warn(`[HD] API ${i + 1} falló: ${err.message}`);
            lastError = err;
        }
    }

    throw new Error(`Todas las APIs fallaron. Último error: ${lastError?.message}`);
}
