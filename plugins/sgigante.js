import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

/**
 * Crea metadatos Exif específicos para el exploit "Chomp"
 * Este ID engaña a WhatsApp para que use el renderizador de un paquete oficial
 */
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
    // Comando 'sg' (Sticker Glitch)
    match: (text, { quoted, getMediaInfo }) => text.toLowerCase() === '.sg' && quoted && getMediaInfo(quoted),

    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        if (mediaInfo.type !== 'image' && mediaInfo.type !== 'video') {
            return sock.sendMessage(remitente, { text: "❌ Responde a una imagen o video corto." });
        }

        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Inyectando exploit en metadatos..." }, { quoted: msg });
        
        const idStr = Date.now().toString();
        const inputPath = `./tmp/in_${idStr}`;
        const tempWebpPath = `./tmp/raw_${idStr}.webp`;
        const exifPath = `./tmp/exif_${idStr}.exif`;
        const outputPath = `./tmp/out_${idStr}.webp`;

        // Asegurar que existe carpeta tmp
        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');

        try {
            // Descarga de media
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const isVideo = mediaInfo.type === 'video';
            
            /**
             * IMPORTANTE: Para que el glitch se vea como en el video, 
             * forzamos dimensiones no estándar y una escala de 512:-1
             */
            const ffmpegPath = process.platform === 'win32' ? './ffmpeg.exe' : './ffmpeg';
            const webpmuxPath = process.platform === 'win32' ? './webpmux.exe' : './webpmux';

            const cmdFfmpeg = isVideo 
                ? `${ffmpegPath} -i "${inputPath}" -vcodec libwebp -filter:v "fps=15,scale=512:-1:flags=lanczos" -lossless 0 -compression_level 6 -q:v 70 -loop 0 -preset picture -an -t 6 "${tempWebpPath}" -y`
                : `${ffmpegPath} -i "${inputPath}" -vcodec libwebp -filter:v "scale=512:-1:flags=lanczos" -lossless 0 -compression_level 6 -q:v 85 -preset picture -an "${tempWebpPath}" -y`;

            await execPromise(cmdFfmpeg);

            // Crear e inyectar EXIF
            fs.writeFileSync(exifPath, createSpoofedExif("Chomp Glitch", "Gemini Bot"));

            // Uso de webpmux local
            await execPromise(`${webpmuxPath} -set exif "${exifPath}" "${tempWebpPath}" -o "${outputPath}"`);

            // Enviar Sticker
            await sock.sendMessage(remitente, { 
                sticker: fs.readFileSync(outputPath) 
            }, { quoted: msg });

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Glitch Sticker:", err);
            await sock.sendMessage(remitente, { text: `❌ Error: Verifica que './ffmpeg' y './webpmux' estén en la raíz.` });
        } finally {
            // Limpieza ruda de archivos temporales
            [inputPath, tempWebpPath, exifPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
