// plugins/tomp3.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'tomp3',
    match: (text) => text.toLowerCase() === 'mp3',
    execute: async ({ sock, remitente, quoted, getMediaInfo, downloadContentFromMessage }) => {
        if (!quoted) return sock.sendMessage(remitente, { text: "⚠️ Responde a un multimedia con 'mp3'." });
        
        const mediaInfo = getMediaInfo(quoted);
        if (!mediaInfo || mediaInfo.type === 'image') return sock.sendMessage(remitente, { text: "❌ No hay multimedia compatible." });

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Convirtiendo a MP3..." });
        const idStr = Date.now().toString();
        const inputPath = `temp_in_${idStr}`;
        const outputPath = `temp_out_${idStr}.mp3`;

        try {
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            await execPromise(`ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}" -y`);
            await sock.sendMessage(remitente, { audio: { url: outputPath }, mimetype: 'audio/mpeg' });
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
};
