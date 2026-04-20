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

        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando exploit (Chomp)..." }, { quoted: msg });
        
        const idStr = Date.now().toString();
        // Usamos path.resolve para rutas absolutas y evitar errores de contenedor
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

            // -2 en scale asegura dimensiones pares para evitar errores de muxer
            const cmdFfmpeg = isVideo 
                ? `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -filter:v "fps=15,scale=512:-2:flags=lanczos" -lossless 0 -compression_level 6 -q:v 70 -loop 0 -preset picture -an -t 6 "${tempWebpPath}" -y`
                : `"${ffmpegPath}" -i "${inputPath}" -vcodec libwebp -filter:v "scale=512:-2:flags=lanczos" -lossless 0 -compression_level 6 -q:v 85 -preset picture -an "${tempWebpPath}" -y`;

            await execPromise(cmdFfmpeg);

            // VALIDACIÓN CRÍTICA: ¿Se creó el archivo y tiene contenido?
            if (!fs.existsSync(tempWebpPath) || fs.statSync(tempWebpPath).size < 100) {
                throw new Error("FFMPEG no generó el WebP correctamente.");
            }

            fs.writeFileSync(exifPath, createSpoofedExif("Chomp Glitch", "Gemini Bot"));

            // Inyección de EXIF
            await execPromise(`"${webpmuxPath}" -set exif "${exifPath}" "${tempWebpPath}" -o "${outputPath}"`);

            if (!fs.existsSync(outputPath)) throw new Error("WEBPMUX falló al generar el archivo final.");

            await sock.sendMessage(remitente, { sticker: fs.readFileSync(outputPath) }, { quoted: msg });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Glitch Sticker:", err);
            await sock.sendMessage(remitente, { text: `❌ Error técnico: ${err.message}` });
        } finally {
            // Limpieza
            [inputPath, tempWebpPath, exifPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
