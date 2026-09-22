const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

module.exports = {
    name: 'downloads',
    // Regex estricto: Solo reacciona si el link es de instagram o tiktok (y sus variantes)
    match: (text) => /^(https?:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    
    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlMatch = textoLimpio.match(/^(https?:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\/[^\s]+)$/i);
        if (!urlMatch) return;
        
        let urlLimpia = urlMatch[1].split(/[?&]si=/)[0].split(/[&?]feature=/)[0];
        let parsedUrl;
        try {
            parsedUrl = new URL(urlLimpia);
        } catch {
            return sock.sendMessage(remitente, { text: "❌ Enlace inválido." });
        }
        const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
        const allowedHosts = new Set(['instagram.com', 'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
        if (!allowedHosts.has(host)) {
            return sock.sendMessage(remitente, { text: "❌ Solo se permiten enlaces de Instagram o TikTok." });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando enlace..." });

        const outName = path.join(__dirname, `../dl_${Date.now()}`);
        const ext = 'mp4'; // IG y TikTok se procesan siempre como video

        const binarySuffix = process.platform === 'win32' ? '.exe' : '';
        const ytDlpPath = path.join(__dirname, `../yt-dlp${binarySuffix}`);
        const ffmpegPath = path.join(__dirname, `../ffmpeg${binarySuffix}`);
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');

        if (!fs.existsSync(ytDlpPath) || !fs.existsSync(ffmpegPath)) {
            return sock.sendMessage(remitente, { text: "❌ Faltan binarios requeridos (yt-dlp/ffmpeg).", edit: statusMsg.key });
        }

        const args = [];
        if (urlLimpia.includes('instagram.com')) {
            if (fs.existsSync(igCookies)) args.push('--cookies', igCookies);
        }

        args.push(
            '--ffmpeg-location', ffmpegPath,
            '--no-playlist',
            '--no-warnings',
            '--geo-bypass',
            '-o', `${outName}.%(ext)s`,
            '-f', 'bestvideo+bestaudio/best',
            '--merge-output-format', 'mp4',
            urlLimpia
        );

        let success = false;
        let lastError = "";

        try {
            await execFilePromise(ytDlpPath, args, { windowsHide: true });
            if (fs.existsSync(`${outName}.${ext}`)) {
                success = true;
            }
        } catch (e) {
            lastError = e.stderr || e.message;
            if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
        }

        if (!success) {
            let errorMensaje = "❌ Error al procesar el enlace.";
            if (lastError.includes("format not available") || lastError.includes("Video unavailable")) {
                errorMensaje = "❌ Error: El vídeo es privado, fue eliminado o el formato no está disponible.";
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
            return sock.sendMessage(remitente, { text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB. Límite de WhatsApp: 50MB.`, edit: statusMsg.key });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando...", edit: statusMsg.key });
            
            const payload = { video: { url: finalFile }, mimetype: 'video/mp4' };

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, { text: "❌ Error al subir el vídeo a WhatsApp.", edit: statusMsg.key });
        } finally {
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
