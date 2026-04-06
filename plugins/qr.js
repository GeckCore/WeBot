const QRCode = require('qrcode');
const Jimp = require('jimp');
const QrCodeReader = require('qrcode-reader');

module.exports = {
    name: 'qr_hibrido',
    match: (text) => /^\.qr(\s.+)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        // 1. DETERMINAR QUÉ HACER (GENERAR O LEER)
        const comandoMatch = textoLimpio.match(/^\.qr\s(.+)$/i);
        const media = getMediaInfo(quoted); // Usamos tu función del index.js

        // CASO A: LEER QR DE UNA IMAGEN (Si respondes a una foto con .qr)
        if (quoted && media && media.type === 'image') {
            await sock.sendMessage(remitente, { text: '🔍 *Analizando imagen...*' }, { quoted: msg });
            
            try {
                // Descargar imagen usando tu ctx
                const stream = await downloadContentFromMessage(media.msg, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                // Procesar con Jimp
                const image = await Jimp.read(buffer);
                const qr = new QrCodeReader();

                const result = await new Promise((resolve, reject) => {
                    qr.callback = (err, value) => err ? reject(err) : resolve(value);
                    qr.decode(image.bitmap);
                });

                return await sock.sendMessage(remitente, { 
                    text: `✅ *Resultado:* ${result.result}` 
                }, { quoted: msg });

            } catch (e) {
                return await sock.sendMessage(remitente, { 
                    text: '❌ No se detectó ningún código QR legible en la imagen.' 
                }, { quoted: msg });
            }
        }

        // CASO B: GENERAR QR (Desde texto directo o mensaje citado)
        let textoParaQR = '';

        if (comandoMatch) {
            textoParaQR = comandoMatch[1].trim();
        } else if (quoted && (quoted.conversation || quoted.extendedTextMessage?.text)) {
            textoParaQR = quoted.conversation || quoted.extendedTextMessage?.text;
        }

        if (!textoParaQR) {
            return await sock.sendMessage(remitente, { 
                text: '💡 *Uso del comando:* \n1. `.qr [texto]` para crear.\n2. Responde a una imagen con `.qr` para leer.' 
            }, { quoted: msg });
        }

        try {
            const qrBuffer = await QRCode.toBuffer(textoParaQR, {
                margin: 2,
                scale: 10
            });

            await sock.sendMessage(remitente, { 
                image: qrBuffer, 
                caption: `✅ *QR Generado*` 
            }, { quoted: msg });

        } catch (err) {
            await sock.sendMessage(remitente, { text: '❌ Error al generar QR.' });
        }
    }
};
