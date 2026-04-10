import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import FormData from 'form-data';

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
                texto3: '⏳ *Mejorando imagen... espera unos segundos.*',
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
            const hdBuffer = await remini(buffer);

            await sock.sendMessage(
                remitente,
                { image: hdBuffer, caption: '✨ *Imagen mejorada con IA*' },
                { quoted: msg }
            );

        } catch (e) {
            console.error('[HD] Error:', e.message);
            await sock.sendMessage(
                remitente,
                { text: tradutor.texto4 + (e.message || 'Error desconocido') },
                { quoted: msg }
            );
        }
    }
};

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

async function downloadImage(imageNode, downloadContentFromMessage) {
    const stream = await downloadContentFromMessage(imageNode, 'image');
    const chunks = [];
    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) throw new Error('No se pudo descargar la imagen.');
    return buffer;
}

function remini(imageData) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('image', Buffer.from(imageData), {
            filename: 'enhance_image_body.jpg',
            contentType: 'image/jpeg'
        });
        formData.append('model_version', 1, {
            'Content-Transfer-Encoding': 'binary',
            contentType: 'multipart/form-data; charset=utf-8'
        });

        formData.submit(
            {
                host: 'inferenceengine.vyro.ai',
                path: '/enhance',
                protocol: 'https:',
                headers: {
                    'User-Agent': 'okhttp/4.9.3',
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip'
                }
            },
            (err, res) => {
                if (err) return reject(new Error('Error conectando a Vyro: ' + err.message));

                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('error', (e) => reject(new Error('Error leyendo respuesta: ' + e.message)));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks);

                    // Descomprimir gzip si es necesario
                    const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
                    if (isGzip) {
                        zlib.gunzip(raw, (err, decompressed) => {
                            if (err) return reject(new Error('Error descomprimiendo gzip: ' + err.message));
                            resolve(decompressed);
                        });
                    } else {
                        resolve(raw);
                    }
                });
            }
        );
    });
}
