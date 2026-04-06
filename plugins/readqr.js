const sharp = require('sharp');
const jsQR = require('jsqr');

module.exports = {
    name: 'lector_qr_ultra',
    match: (text) => /^\.readqr$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        const media = getMediaInfo(quoted);

        if (!quoted || !media || (media.type !== 'image' && media.type !== 'sticker')) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Responde a una imagen o sticker con .readqr*' 
            }, { quoted: msg });
        }

        try {
            // 1. Descargar multimedia a RAM
            const stream = await downloadContentFromMessage(media.msg, media.type === 'image' ? 'image' : 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 2. Procesar con SHARP (Más rápido y estable que Jimp)
            // Convertimos a escala de grises y obtenemos el buffer de píxeles "raw"
            const { data, info } = await sharp(buffer)
                .ensureAlpha() // Asegura canal RGBA
                .greyscale()   // Optimiza para QR
                .raw()
                .toBuffer({ resolveWithObject: true });

            // 3. Usar jsQR con los datos de Sharp
            const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

            if (!code) {
                return await sock.sendMessage(remitente, { 
                    text: '❌ *Error:* No se pudo leer el código QR. Intenta que la imagen no esté borrosa.' 
                }, { quoted: msg });
            }

            // 4. Enviar resultado
            let contenido = code.data;
            let respuesta = `✅ *QR Escaneado:*\n\n${contenido}`;
            
            if (contenido.startsWith('http')) {
                respuesta = `🔗 *Enlace encontrado:*\n${contenido}`;
            }

            await sock.sendMessage(remitente, { 
                text: respuesta,
                detectLinks: true 
            }, { quoted: msg });

        } catch (err) {
            console.error('Error en readqr:', err);
            await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
        }
    }
};
