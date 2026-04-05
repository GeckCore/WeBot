// plugins/downloads.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio }) => {
        let urlLimpia = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i)[1].split('&si=')[0].split('?si=')[0].split('&feature=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "🔍 Analizando enlace en Pterodactyl..." });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const outName = `dl_${Date.now()}`;
        const ext = isAudio ? 'wav' : 'mp4';
        const format = isAudio ? '-f "bestaudio/best" -x --audio-format wav' : '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        
        // USAMOS ./yt-dlp PARA QUE FUNCIONE EN EL CONTENIDOR
        const cmdBase = `./yt-dlp --no-playlist --no-warnings -o "${outName}.%(ext)s" ${format}`;

        const attempts = [
            `${cmdBase} --extractor-args "youtube:player_client=android" --add-header "User-Agent:Mozilla/5.0" "${urlLimpia}"`,
            `${cmdBase} --extractor-args "youtube:player_client=ios" "${urlLimpia}"`,
            `${cmdBase} "${urlLimpia}"`
        ];

        let success = false;
        let errorLog = "";

        for (const cmd of attempts) {
            try {
                await execPromise(cmd);
                if (fs.existsSync(`${outName}.${ext}`)) { success = true; break; }
            } catch (e) {
                errorLog = e.stderr || e.message;
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) {
            return sock.sendMessage(remitente, { text: `❌ Error: Asegúrate de que el archivo 'yt-dlp' esté en la carpeta raíz y tenga permisos chmod +x.`, edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        if (fs.statSync(finalFile).size / (1024 * 1024) > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo supera los 50MB.`, edit: statusMsg.key });
        }

        await sock.sendMessage(remitente, { text: "🚀 Enviando...", edit: statusMsg.key });
        await sock.sendMessage(remitente, isAudio 
            ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `Audio_${Date.now()}.wav` } 
            : { video: { url: finalFile }, mimetype: 'video/mp4' }
        );
        
        await sock.sendMessage(remitente, { delete: statusMsg.key });
        fs.unlinkSync(finalFile);
    }
};
