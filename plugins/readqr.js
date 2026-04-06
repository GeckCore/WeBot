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

            // 2. Procesar con Jimp (Corrección de Importación)
            // Usamos un pequeño truco para que funcione en cualquier versión de Jimp
            const JimpInstance = Jimp.default || Jimp;
            const image = await JimpInstance.read(buffer);
            
            // Optimizamos para lectura: gris y contraste
            image.greyscale().contrast(0.2); 

            // Extraemos los datos de la matriz de píxeles
            const width = image.bitmap.width;
            const height = image.bitmap.height;
            const rgbaData = new Uint8ClampedArray(image.bitmap.data);

            // 3. Usar jsQR
            const code = jsQR(rgbaData, width, height);

            if (!code) {
                return await sock.sendMessage(remitente, { 
                    text: '❌ *Error:* No se detectó el código QR. Prueba enviando la foto más cerca o con mejor luz.' 
                }, { quoted: msg });
            }

            // 4. Resultado
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
            await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
        }
    }
};
