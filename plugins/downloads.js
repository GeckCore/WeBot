const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlMatch = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i);
        if (!urlMatch) return;
        
        let urlLimpia = urlMatch[1].split(/[?&]si=/)[0].split(/[&?]feature=/)[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando enlace..." });

        const isAudio = ['soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const outName = path.join(__dirname, `../dl_${Date.now()}`);
        const ext = isAudio ? 'wav' : 'mp4';
        
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');

        let cookieArg = "";
        if (urlLimpia.includes('instagram.com')) {
            if (fs.existsSync(igCookies)) cookieArg = `--cookies "${igCookies}"`;
        }

        const format = isAudio 
            ? `-f "bestaudio/best" -x --audio-format wav` 
            : `-f "bestvideo+bestaudio/best" --merge-output-format mp4`;

        const cmd = `${ytDlpPath} ${cookieArg} --ffmpeg-location "${ffmpegPath}" --no-playlist --no-warnings --geo-bypass -o "${outName}.%(ext)s" ${format} "${urlLimpia}"`;

        let success = false;
        let lastError = "";

        try {
            await execPromise(cmd);
            if (fs.existsSync(`${outName}.${ext}`)) {
                success = true;
            }
        } catch (e) {
            lastError = e.stderr || e.message;
            if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
        }

        if (!success) {
            let errorMensaje = "❌ Error al procesar el enlace.";
            if (lastError.includes("format not available")) {
                errorMensaje = "❌ Error: Formato no disponible.";
            } else {
                errorMensaje = `❌ Error técnico:\n${lastError.substring(0, 150)}`;
            }
            return sock.sendMessage(remitente, { text: errorMensaje, edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        const stats = fs.statSync(finalFile);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB. Límite: 50MB.`, edit: statusMsg.key });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando...", edit: statusMsg.key });
            
            const payload = isAudio 
                ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `Audio_${Date.now()}.wav` } 
                : { video: { url: finalFile }, mimetype: 'video/mp4' };

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, { text: "❌ Error al subir a WhatsApp.", edit: statusMsg.key });
        } finally {
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
