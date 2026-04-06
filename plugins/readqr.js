const Jimp = require('jimp');
const QrCodeReader = require('qrcode-reader');

module.exports = {
    name: 'lector_qr_avanzado',
    // Match para el comando .readqr
    match: (text) => /^\.readqr$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        // 1. Verificación: ¿Estamos respondiendo a una imagen?
        const media = getMediaInfo(quoted);

        if (!quoted || !media || (media.type !== 'image' && media.type !== 'sticker')) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Error:* Debes responder a una **imagen** o **sticker** que contenga un código QR usando el comando `.readqr`.' 
            }, { quoted: msg });
        }

        await sock.sendMessage(remitente, { text: '🔍 *Escaneando código QR...*' }, { quoted: msg });

        try {
            // 2. Descargar el contenido multimedia de la VPS a la RAM
            const stream = await downloadContentFromMessage(media.msg, media.type === 'image' ? 'image' : 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 3. Procesamiento de imagen con Jimp
            const image = await Jimp.read(buffer);
            const qr = new QrCodeReader();

            // 4. Decodificación del QR
            const resultado = await new Promise((resolve, reject) => {
                qr.callback = (err, value) => {
                    if (err) return reject(new Error('No se encontró un QR legible.'));
                    if (!value) return reject(new Error('El QR está vacío o dañado.'));
                    resolve(value.result);
                };
                qr.decode(image.bitmap);
            });

            // 5. Respuesta inteligente según el contenido
            let respuestaFinal = `✅ *Resultado del escaneo:*\n\n${resultado}`;
            
            // Si es un enlace, intentamos que WhatsApp genere una vista previa (opcional)
            if (resultado.startsWith('http')) {
                respuestaFinal = `🔗 *Enlace detectado:*\n${resultado}`;
            }

            await sock.sendMessage(remitente, { 
                text: respuestaFinal,
                detectLinks: true 
            }, { quoted: msg });

        } catch (err) {
            console.error('Error al leer QR:', err.message);
            await sock.sendMessage(remitente, { 
                text: `❌ *Error:* No pude leer el código QR. Asegúrate de que la imagen sea nítida y el QR esté centrado.` 
            }, { quoted: msg });
        }
    }
};
