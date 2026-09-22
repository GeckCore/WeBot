// plugins/sticker.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const { ensureFfmpegAvailable } = require('../src/utils/ffmpeg');

module.exports = {
    name: 'sticker',
    match: (text, { quoted, getMediaInfo }) => /^\.(s|sticker)$/i.test((text || '').trim()) && quoted && getMediaInfo(quoted),
    execute: async ({ sock, remitente, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        if (!mediaInfo || (mediaInfo.type !== 'image' && mediaInfo.type !== 'video')) {
            return sock.sendMessage(remitente, { text: "⚠️ Responde a una imagen o video con *.sticker*." });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando sticker..." });
        const idStr = Date.now().toString();
        const inputPath = path.join(os.tmpdir(), `temp_stk_in_${idStr}.${mediaInfo.ext || 'bin'}`);
        const outputPath = path.join(os.tmpdir(), `temp_stk_out_${idStr}.webp`);

        try {
            const ffmpegStatus = ensureFfmpegAvailable();
            if (!ffmpegStatus.ok) {
                return sock.sendMessage(remitente, { text: `❌ ${ffmpegStatus.message}` });
            }

            const isVideo = mediaInfo.type === 'video';
            const maxSeconds = Math.max(1, Number(process.env.STICKER_MAX_SECONDS || 8));
            const maxBytes = Math.max(1024 * 1024, Number(process.env.STICKER_MAX_INPUT_BYTES || 25 * 1024 * 1024));
            const duration = Number(mediaInfo.msg?.seconds || 0);
            const rawLength = mediaInfo.msg?.fileLength;
            const fileLength = rawLength && typeof rawLength === 'object' && typeof rawLength.toString === 'function'
                ? Number(rawLength.toString())
                : Number(rawLength || 0);

            if (isVideo && duration > maxSeconds) {
                return sock.sendMessage(remitente, { text: `⚠️ El video es demasiado largo. Máximo permitido: ${maxSeconds} segundos.` });
            }
            if (fileLength > maxBytes) {
                return sock.sendMessage(remitente, { text: `⚠️ El archivo es demasiado pesado. Máximo permitido: ${Math.floor(maxBytes / 1024 / 1024)} MB.` });
            }

            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const filterStr = "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:-1:-1:color=0x00000000,setsar=1";
            const args = [
                '-y',
                '-i', inputPath,
                '-vcodec', 'libwebp',
                '-filter:v', isVideo ? filterStr : filterStr.replace('fps=12,', ''),
                '-lossless', '0',
                '-compression_level', '4',
                '-q:v', '50',
                '-preset', 'picture',
                '-an'
            ];
            if (isVideo) {
                args.push('-loop', '0', '-t', String(Math.min(maxSeconds, 8)));
            }
            args.push(outputPath);

            await execFilePromise(ffmpegStatus.ffmpegPath, args);
            await sock.sendMessage(remitente, { sticker: { url: outputPath } });
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (err) {
            await sock.sendMessage(remitente, { text: `❌ Error al crear sticker: ${(err.message || '').substring(0, 120)}`, edit: statusMsg.key });
        } finally {
            if (fs.existsSync(inputPath)) {
                try { fs.unlinkSync(inputPath); } catch (e) {}
            }
            if (fs.existsSync(outputPath)) {
                try { fs.unlinkSync(outputPath); } catch (e) {}
            }
        }
    }
};
