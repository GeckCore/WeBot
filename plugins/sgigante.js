import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

const createSpoofedExif = (packname, author) => {
    const json = {
        "sticker-pack-id": "com.whatsapp.stickers.chomp",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "emojis": ["💀"]
    };
    const jsonStr = JSON.stringify(json);
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(jsonStr, 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff, Buffer.from([0x00])]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);
    return exif;
};

export default {
    name: 'sticker_glitch',
    match: (text, { quoted, getMediaInfo }) => text.toLowerCase() === '.sg' && quoted && getMediaInfo(quoted),

    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        if (mediaInfo.type !== 'image' && mediaInfo.type !== 'video') return;

        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Generando Glitch..." }, { quoted: msg });
        
        const idStr = Date.now().toString();
        const tmpDir = path.resolve('./tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const inputPath = path.join(tmpDir, `in_${idStr}`);
        const tempWebpPath = path.join(tmpDir, `raw_${idStr}.webp`);
        const exifPath = path.join(tmpDir, `exif_${idStr}.exif`);
        const outputPath = path.join(tmpDir, `out_${idStr}.webp`);

        try {
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const isVideo = mediaInfo.type === 'video';
            const ffmpegPath = path.resolve('./ffmpeg');
            const webpmuxPath = path.resolve('./webpmux');

            // FILTRO ESTRICTO: Encaja la imagen en 512x512 y rellena lo sobrante con transparencia absoluta.
            // Esto garantiza un 100% de aceptación por parte de los servidores de WhatsApp.
            const scaleFilter = "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000";
            
            const cmdFfmpeg = isVideo 
                ? `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -vf "${scaleFilter},fps=15" -lossless 0 -compression_level 4 -q:v 50 -loop 0 -preset picture -an -t 5 "${tempWebpPath}" -y`
                : `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -vf "${scaleFilter}" -lossless 0 -compression_level 4 -q:v 70 -preset picture -an "${tempWebpPath}" -y`;

            await execPromise(cmdFfmpeg);

            if (!fs.existsSync(tempWebpPath)) throw new Error("FFMPEG falló al codificar.");

            // Inyectamos el ID oficial de Chomp
            fs.writeFileSync(exifPath, createSpoofedExif("Chomp Glitch", "Gemini"));

            // Ensamblamos el EXIF con el WebP limpio
            await execPromise(`"${webpmuxPath}" -set exif "${exifPath}" "${tempWebpPath}" -o "${outputPath}"`);

            // Enviamos
            await sock.sendMessage(remitente, { sticker: fs.readFileSync(outputPath) }, { quoted: msg });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Glitch Sticker:", err);
            await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
        } finally {
            // Limpieza
            [inputPath, tempWebpPath, exifPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
