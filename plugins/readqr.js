const Jimp = require('jimp');
const jsQR = require('jsqr');

module.exports = {
    name: 'lector_qr_pro',
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

            // 2. Procesar con Jimp para obtener datos de píxeles puros (RGBA)
            const image = await Jimp.read(buffer);
            
            // Optimizamos la imagen para el lector: escala de grises y contraste
            image.greyscale().contrast(0.2); 

            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const rgbaData = image.bitmap.data;

            // 3. Usar jsQR (Motor mucho más preciso que el anterior)
            const code = jsQR(rgbaData, width, height);

            if (!code) {
                return await sock.sendMessage(remitente, { 
                    text: '❌ *Error:* No se detectó el código QR. Intenta enviar la foto con mejor iluminación o menos ángulo.' 
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
            console.error('Error crítico en readqr:', err);
            await sock.sendMessage(remitente, { text: '❌ Error técnico al procesar la imagen.' });
        }
    }
};
