const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'sticker_to_media',
    match: (text, ctx) => /^(img|toimg|tovideo|togif)$/i.test(text) && ctx.quoted?.stickerMessage,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        const isAnimated = quoted.stickerMessage.isAnimated;
        const statusMsg = await sock.sendMessage(remitente, { text: `⏳ Procesando: ${isAnimated ? 'Video' : 'Imagen'}...` }, { quoted: msg });

        const tempWebp = path.join(__dirname, `../temp_${Date.now()}.webp`);
        const tempOut = path.join(__dirname, `../out_${Date.now()}.${isAnimated ? 'mp4' : 'png'}`);

        try {
            const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(tempWebp, buffer);

            // COMANDO REFORZADO:
            // -vcodec webp: Fuerza el decodificador correcto para webp animado
            // -probesize / -analyzeduration: Ayuda a detectar frames en archivos mal formados
            const ffmpegCmd = isAnimated 
    ? `./ffmpeg -i ${tempWebp} -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset fast -crf 22 -movflags faststart ${tempOut}`
    : `./ffmpeg -i ${tempWebp} ${tempOut}`;

            await execPromise(ffmpegCmd);

            if (fs.existsSync(tempOut)) {
                if (isAnimated) {
                    await sock.sendMessage(remitente, { video: { url: tempOut }, caption: '✅ Video generado.' }, { quoted: msg });
                } else {
                    await sock.sendMessage(remitente, { image: { url: tempOut }, caption: '✅ Imagen generada.' }, { quoted: msg });
                }
            } else {
                throw new Error("FFmpeg no generó el archivo de salida.");
            }

        } catch (err) {
            console.error("DETALLE ERROR:", err);
            await sock.sendMessage(remitente, { text: `❌ Error: El sticker animado tiene un formato incompatible o el servidor no tiene RAM suficiente.` });
        } finally {
            if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
