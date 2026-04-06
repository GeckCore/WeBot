const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'sticker_to_img',
    // EL FILTRO CRÍTICO: Solo entra si NO es animado (!ctx.quoted.stickerMessage.isAnimated)
    match: (text, ctx) => 
        /^(img|toimg)$/i.test(text) && 
        ctx.quoted?.stickerMessage && 
        !ctx.quoted.stickerMessage.isAnimated,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Convirtiendo sticker a imagen..." }, { quoted: msg });

        const tempWebp = path.join(__dirname, `../temp_${Date.now()}.webp`);
        const tempOut = path.join(__dirname, `../out_${Date.now()}.png`);

        try {
            // 1. Descargar el sticker
            const stream = await downloadContentFromMessage(quoted.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            fs.writeFileSync(tempWebp, buffer);

            // 2. Conversión simple (WebP estático -> PNG)
            // Usamos el FFmpeg de la raíz que ya sabemos que funciona para fotos
            await execPromise(`./ffmpeg -i ${tempWebp} ${tempOut}`);

            if (fs.existsSync(tempOut)) {
                await sock.sendMessage(remitente, { 
                    image: { url: tempOut }, 
                    caption: '✅ Aquí tienes tu imagen.' 
                }, { quoted: msg });
            } else {
                throw new Error("Error al generar la imagen.");
            }

        } catch (err) {
            console.error("Error en conversor:", err.message);
            await sock.sendMessage(remitente, { text: "❌ No se pudo convertir este sticker." });
        } finally {
            // Limpieza obligatoria de temporales
            if (fs.existsSync(tempWebp)) fs.unlinkSync(tempWebp);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
