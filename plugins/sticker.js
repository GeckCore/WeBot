// plugins/sticker.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'sticker',
    match: (text, { quoted, getMediaInfo }) => text.toLowerCase() === 's' && quoted && getMediaInfo(quoted),
    execute: async ({ sock, remitente, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const mediaInfo = getMediaInfo(quoted);
        if (mediaInfo.type !== 'image' && mediaInfo.type !== 'video') return;

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando sticker..." });
        const idStr = Date.now().toString();
        const inputPath = `temp_stk_in_${idStr}`;
        const outputPath = `temp_stk_out_${idStr}.webp`;

        try {
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const isVideo = mediaInfo.type === 'video';
            const filterStr = "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000";
            const cmd = isVideo 
                ? `ffmpeg -i "${inputPath}" -vcodec libwebp -filter:v "fps=12,${filterStr}" -lossless 0 -compression_level 4 -q:v 50 -loop 0 -preset picture -an -t 5 "${outputPath}" -y`
                : `ffmpeg -i "${inputPath}" -vcodec libwebp -filter:v "${filterStr}" -lossless 0 -compression_level 4 -q:v 50 -preset picture -an "${outputPath}" -y`;

            await execPromise(cmd);
            await sock.sendMessage(remitente, { sticker: { url: outputPath } });
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
};
