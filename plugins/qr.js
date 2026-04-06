const QRCode = require('qrcode');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Función auxiliar para subir a Catbox (Anónimo y rápido)
async function uploadToCatbox(buffer, fileName) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    // Catbox usa archivos con nombre, creamos uno temporal para el form-data
    form.append('fileToUpload', buffer, fileName);

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: { ...form.getHeaders() }
    });
    
    if (response.data && response.data.startsWith('https://')) {
        return response.data; // URL directa del archivo subido
    } else {
        throw new Error('Falló la subida a Catbox: ' + response.data);
    }
}

module.exports = {
    name: 'qr_universal',
    match: (text) => /^\.qr(\s.+)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        let urlOTextoFinal = '';
        const comandoMatch = textoLimpio.match(/^\.qr\s(.+)$/i);
        const media = getMediaInfo(quoted); // Función de tu index.js

        // --- CASO 1: RESPONDER A MULTIMEDIA (Imagen/Video) ---
        if (quoted && media) {
            if (media.type === 'image' || media.type === 'video') {
                
                await sock.sendMessage(remitente, { text: `⏳ *Subiendo ${media.type} a la nube...*` }, { quoted: msg });
                
                try {
                    // 1. Descargar el archivo
                    const stream = await downloadContentFromMessage(media.msg, media.type);
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    // 2. Subir a la nube (Catbox)
                    // Generamos un nombre aleatorio con la extensión correcta
                    const fileName = `${msg.key.id}_${Date.now()}.${media.ext}`;
                    const fileUrl = await uploadToCatbox(buffer, fileName);

                    console.log(`[SISTEMA] Archivo subido a Catbox: ${fileUrl}`);
                    urlOTextoFinal = fileUrl; // Este enlace es el que irá en el QR

                } catch (e) {
                    console.error('Error en subida/generación QR multimedia:', e);
                    return await sock.sendMessage(remitente, { 
                        text: `❌ Error al procesar el ${media.type}. Intenta de nuevo.` 
                    }, { quoted: msg });
                }
            }
        }

        // --- CASO 2: TEXTO O ENLACE DIRECTO (Si no hubo multimedia) ---
        if (!urlOTextoFinal) {
            if (comandoMatch) {
                urlOTextoFinal = comandoMatch[1].trim();
            } else if (quoted && (quoted.conversation || quoted.extendedTextMessage?.text)) {
                urlOTextoFinal = quoted.conversation || quoted.extendedTextMessage?.text;
            }
        }

        // --- VALIDACIÓN Y GENERACIÓN DEL QR FINAL ---
        if (!urlOTextoFinal || urlOTextoFinal.length > 2500) {
            return await sock.sendMessage(remitente, { 
                text: '💡 *Uso del comando:* \n1. `.qr [texto o enlace]` para crear.\n2. Responde a una imagen/video con `.qr` para que al escanearlo se vea el archivo.' 
            }, { quoted: msg });
        }

        try {
            // Generar QR a Buffer (Optimizado para VPS)
            const qrBuffer = await QRCode.toBuffer(urlOTextoFinal, {
                margin: 2,
                scale: 10,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            const leyenda = media ? `✅ *QR Universal*\nAl escanearlo verás el archivo subido.` : `✅ *QR Universal*`;

            await sock.sendMessage(remitente, { 
                image: qrBuffer, 
                caption: leyenda 
            }, { quoted: msg });

        } catch (err) {
            console.error('Error al generar QR final:', err);
            await sock.sendMessage(remitente, { text: '❌ Error interno al generar el código QR.' });
        }
    }
};
