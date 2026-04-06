const sharp = require('sharp');
const jsQR = require('jsqr');

module.exports = {
    name: 'lector_qr_ultra_v2',
    match: (text) => /^\.readqr$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        const media = getMediaInfo(quoted);

        if (!quoted || !media || (media.type !== 'image' && media.type !== 'sticker')) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Responde a una imagen o sticker con .readqr*' 
            }, { quoted: msg });
        }

        try {
            // 1. Descargar multimedia a RAM (Buffer)
            const stream = await downloadContentFromMessage(media.msg, media.type === 'image' ? 'image' : 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 2. Procesar con SHARP
            // IMPORTANTE: Quitamos .greyscale() aquí porque jsQR NECESITA los 4 canales (RGBA)
            // aunque la imagen sea en blanco y negro.
            const { data, info } = await sharp(buffer)
                .ensureAlpha() // Forzamos el canal Alpha para tener 4 bytes por píxel (RGBA)
                .raw()
                .toBuffer({ resolveWithObject: true });

            // 3. Usar jsQR
            // Convertimos el buffer de Sharp a Uint8ClampedArray que es lo que pide el binarizador
            const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

            if (!code) {
                return await sock.sendMessage(remitente, { 
                    text: '❌ *Error:* No se pudo detectar el código QR. Intenta que la imagen no tenga reflejos o esté muy lejos.' 
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
            console.error('Error en readqr:', err);
            await sock.sendMessage(remitente, { text: `❌ Error técnico: ${err.message}` });
        }
    }
};
