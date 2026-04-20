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

        await sock.sendMessage(remitente, { text: "⏳ Aplicando exploit Chomp (v3)..." }, { quoted: msg });
        
        const idStr = Date.now().toString();
        const tmpDir = path.resolve('./tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const inputPath = path.join(tmpDir, `in_${idStr}`);
        const midPath = path.join(tmpDir, `mid_${idStr}.png`); // Paso intermedio para vídeos
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
            const cwebpPath = path.resolve('./cwebp');
            const webpmuxPath = path.resolve('./webpmux');

            if (isVideo) {
                // Para video, sacamos un frame limpio con ffmpeg y luego cwebp lo remata
                await execPromise(`"${ffmpegPath}" -i "${inputPath}" -vframes 1 -vf "scale=512:-2" "${midPath}" -y`);
                await execPromise(`"${cwebpPath}" "${midPath}" -o "${tempWebpPath}" -q 80`);
            } else {
                // Para imagen, cwebp directo (es mucho más limpio que ffmpeg)
                await execPromise(`"${cwebpPath}" "${inputPath}" -resize 512 0 -o "${tempWebpPath}" -q 80`);
            }

            if (!fs.existsSync(tempWebpPath)) throw new Error("Fallo en la codificación WebP.");

            fs.writeFileSync(exifPath, createSpoofedExif("Chomp Glitch", "Gemini Bot"));

            // Inyección EXIF (Ahora cwebp garantiza que el archivo es compatible)
            await execPromise(`"${webpmuxPath}" -set exif "${exifPath}" "${tempWebpPath}" -o "${outputPath}"`);

            await sock.sendMessage(remitente, { sticker: fs.readFileSync(outputPath) }, { quoted: msg });

        } catch (err) {
            console.error("Error Glitch Sticker:", err);
            await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
        } finally {
            [inputPath, midPath, tempWebpPath, exifPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
