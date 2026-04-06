const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'sticker_to_media',
    // Match: Si escribes "img" o "toimg" respondiendo a un sticker
    match: (text, ctx) => /^(img|toimg|tovideo|togif)$/i.test(text) && ctx.quoted?.stickerMessage,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        const isAnimated = quoted.stickerMessage.isAnimated;
        const statusMsg = await sock.sendMessage(remitente, { text: `⏳ Convirtiendo ${isAnimated ? 'sticker animado a video...' : 'sticker a imagen...'}` }, { quoted: msg });

        const tempWebp = path.join(__dirname, `../temp_${Date.now()}.webp`);
        const tempOut = path.join(__dirname, `../out_${Date.now()}.${isAnimated ? 'mp4' : 'png'}`);

        try {
            // 1. Descargar el sticker (webp)
            const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(tempWebp, buffer);

            // 2. Conversión usando el FFmpeg de tu raíz
            // Si es animado, usamos filtros para asegurar compatibilidad con WhatsApp (yuv420p)
            const ffmpegCmd = isAnimated 
                ? `./ffmpeg -i ${tempWebp} -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p -c:v libx264 -movflags faststart ${tempOut}`
                : `./ffmpeg -i ${tempWebp} ${tempOut}`;

            await execPromise(ffmpegCmd);

            // 3. Enviar el resultado
            if (fs.existsSync(tempOut)) {
                if (isAnimated) {
                    await sock.sendMessage(remitente, { video: { url: tempOut }, caption: '✅ Sticker animado convertido a video.' }, { quoted: msg });
                } else {
                    await sock.sendMessage(remitente, { image: { url: tempOut }, caption: '✅ Sticker convertido a imagen.' }, { quoted: msg });
                }
            } else {
                throw new Error("Fallo en la salida de FFmpeg");
            }

        } catch (err) {
            console.error(err);
            await sock.sendMessage(remitente, { text: `❌ Error en la conversión: ${err.message}` });
        } finally {
            // Limpieza de archivos temporales para no llenar la RAM/Disco de la VPS
            if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
