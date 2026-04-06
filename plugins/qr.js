const QRCode = require('qrcode');
const Jimp = require('jimp');
const QrCodeReader = require('qrcode-reader');

module.exports = {
    name: 'generador_lector_qr',
    // Match para el comando .qr (aceptando mayúsculas/minúsculas)
    match: (text) => /^\.qr(\s.+)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        let textoParaQR = '';
        const comandoMatch = textoLimpio.match(/^\.qr\s(.+)$/i);

        // --- LÓGICA DE DETECCIÓN (HÍBRIDA) ---

        // Caso 1: Se escribió texto directo (.qr https://google.com)
        if (comandoMatch) {
            textoParaQR = comandoMatch[1].trim();
        }
        // Caso 2: Se respondió a un mensaje
        else if (quoted) {
            // Subcaso A: Se respondió a un mensaje de TEXTO
            if (quoted.conversation || quoted.extendedTextMessage?.text) {
                textoParaQR = quoted.conversation || quoted.extendedTextMessage?.text;
            }
            // Subcaso B: Se respondió a una IMAGEN (Intentar leer QR)
            else if (quoted.imageMessage) {
                await sock.sendMessage(remitente, { text: '⏳ Leyendo código QR de la imagen...' }, { quoted: msg });
                
                try {
                    // Descargar la imagen citada
                    const stream = await downloadContentFromMessage(quoted.imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    // Procesar imagen con Jimp y QrCodeReader
                    const image = await Jimp.read(buffer);
                    const qr = new QrCodeReader();

                    const result = await new Promise((resolve, reject) => {
                        qr.callback = (err, value) => err ? reject(err) : resolve(value);
                        qr.decode(image.bitmap);
                    });

                    return await sock.sendMessage(remitente, { 
                        text: `✅ *Contenido del QR:* ${result.result}` 
                    }, { quoted: msg });

                } catch (e) {
                    return await sock.sendMessage(remitente, { 
                        text: '❌ No pude encontrar un código QR válido en esa imagen.' 
                    }, { quoted: msg });
                }
            }
        }

        // --- VALIDACIÓN Y GENERACIÓN ---

        if (!textoParaQR || textoParaQR.length > 2000) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Uso:* Escribe `.qr [texto]` o responde a un mensaje de texto con `.qr`.\n*(Máx. 2000 caracteres)*' 
            }, { quoted: msg });
        }

        try {
            // Generar QR directamente a un Buffer (Optimizado para VPS, no usa disco)
            const qrBuffer = await QRCode.toBuffer(textoParaQR, {
                type: 'png',
                margin: 2,
                scale: 10,
                color: {
                    dark: '#000000', // Negro
                    light: '#FFFFFF' // Blanco
                }
            });

            // Enviar la imagen del QR
            await sock.sendMessage(remitente, { 
                image: qrBuffer, 
                caption: `✅ *QR Generado con éxito.*` 
            }, { quoted: msg });

        } catch (err) {
            console.error('Error generando QR:', err);
            await sock.sendMessage(remitente, { text: '❌ Error interno al generar el código QR.' }, { quoted: msg });
        }
    }
};
