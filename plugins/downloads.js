// plugins/downloads.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlLimpia = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i)[1].split('&si=')[0].split('?si=')[0].split('&feature=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "Evaluando bypass..." });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const usaDRM = ['spotify.com', 'tidal.com'].some(d => urlLimpia.includes(d));

        const outName = `dl_${Date.now()}`;
        const ext = isAudio ? 'wav' : 'mp4';
        const format = isAudio ? '-f "bestaudio/best" -x --audio-format wav' : '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cmdBase = `yt-dlp --no-playlist --no-warnings -o "${outName}.%(ext)s" ${format}`;

        const attempts = usaDRM ? [`${cmdBase} "ytsearch1:${urlLimpia}"`] : [
            `${cmdBase} --extractor-args "youtube:player_client=android" --add-header "User-Agent:Mozilla/5.0" "${urlLimpia}"`,
            `${cmdBase} --extractor-args "youtube:player_client=ios" "${urlLimpia}"`,
            `${cmdBase} "${urlLimpia}"`
        ];

        let success = false;
        for (const cmd of attempts) {
            try {
                await execPromise(cmd);
                if (fs.existsSync(`${outName}.${ext}`)) { success = true; break; }
            } catch (e) {
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) return sock.sendMessage(remitente, { text: "❌ Bloqueado por la plataforma o fallo en yt-dlp.", edit: statusMsg.key });

        const finalFile = `${outName}.${ext}`;
        if (fs.statSync(finalFile).size / (1024 * 1024) > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ Excede límite (50MB).`, edit: statusMsg.key });
        }

        await sock.sendMessage(remitente, { text: "Transmitiendo...", edit: statusMsg.key });
        await sock.sendMessage(remitente, isAudio ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `${outName}.wav` } : { video: { url: finalFile }, mimetype: 'video/mp4' });
        
        await sock.sendMessage(remitente, { delete: statusMsg.key });
        fs.unlinkSync(finalFile);
    }
};
