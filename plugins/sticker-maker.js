import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export default {
    name: 'stickers',
    // Captura .s, .sticker y .toimg (para el proceso inverso)
    match: (text) => /^\.(s|sticker|toimg)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, downloadContentFromMessage, getMediaInfo }) => {
        const command = textoLimpio.toLowerCase().split(' ')[0];
        const isToImg = command === '.toimg';

        // 1. Identificar el contenido (mensaje actual o citado)
        const q = quoted || msg.message;
        const media = getMediaInfo(q);

        if (!media && !isToImg) {
            return sock.sendMessage(remitente, { text: '⚠️ *Uso:* Responde a una imagen o vídeo con `.s` para crear un sticker.' }, { quoted: msg });
        }

        const tempFile = path.join(process.cwd(), `temp_${Date.now()}`);
        const outFile = `${tempFile}.webp`;
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            // --- MODO: STICKER A IMAGEN (.toimg) ---
            if (isToImg) {
                if (!q.stickerMessage) return sock.sendMessage(remitente, { text: '⚠️ Debes responder a un *sticker*.' });
                
                const stream = await downloadContentFromMessage(q.stickerMessage, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                
                const stickerPath = `${tempFile}.webp`;
                const imgOut = `${tempFile}.png`;
                fs.writeFileSync(stickerPath, buffer);

                await execPromise(`"${ffmpegPath}" -i "${stickerPath}" "${imgOut}"`);
                await sock.sendMessage(remitente, { image: { url: imgOut }, caption: '✅ Convertido a imagen' }, { quoted: msg });
                
                if (fs.existsSync(stickerPath)) fs.unlinkSync(stickerPath);
                if (fs.existsSync(imgOut)) fs.unlinkSync(imgOut);
                return;
            }

            // --- MODO: IMAGEN/VÍDEO A STICKER (.s) ---
            await sock.sendMessage(remitente, { text: '⏳ *Procesando sticker...*' }, { quoted: msg });

            const stream = await downloadContentFromMessage(media.msg, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            const inputPath = `${tempFile}.${media.ext}`;
            fs.writeFileSync(inputPath, buffer);

            // Comando optimizado para stickers (Imagen o Vídeo)
            // -vf: Escala a 512x512 manteniendo ratio y añade padding negro (formato sticker)
            const ffmpegCmd = media.type === 'video' 
                ? `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -filter_complex "[0:v] scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=black@0" -loop 0 -preset default -an -vsync 0 -s 512:512 "${outFile}"`
                : `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -filter_complex "[0:v] scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(512-iw)/2:(512-ih)/2:color=black@0" "${outFile}"`;

            await execPromise(ffmpegCmd);

            await sock.sendMessage(remitente, { 
                sticker: { url: outFile }
            }, { quoted: msg });

            // Limpieza
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

        } catch (e) {
            console.error('Error en Stickers:', e);
            await sock.sendMessage(remitente, { text: '❌ Fallo al procesar el sticker. Asegúrate de que el vídeo sea corto (<10s).' });
        }
    }
};
