const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio }) => {
        // Limpieza de URL (quitamos parámetros de rastreo que rompen yt-dlp)
        const urlMatch = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i);
        if (!urlMatch) return;
        
        let urlLimpia = urlMatch[1].split(/[?&]si=/)[0].split(/[&?]feature=/)[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Analizando y descargando..." });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const outName = path.join(__dirname, `../dl_${Date.now()}`);
        const ext = isAudio ? 'wav' : 'mp4';
        
        // Rutas a Binarios y Cookies en la raíz
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');
        const ytCookies = path.join(__dirname, '../youtube_cookies.txt');
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');

        // Selección de Cookies según plataforma
        let cookieArg = "";
        if (urlLimpia.includes('youtube.com') || urlLimpia.includes('youtu.be')) {
            if (fs.existsSync(ytCookies)) cookieArg = `--cookies "${ytCookies}"`;
        } else if (urlLimpia.includes('instagram.com')) {
            if (fs.existsSync(igCookies)) cookieArg = `--cookies "${igCookies}"`;
        }

        // Configuración de formato y calidad
        const format = isAudio 
            ? `-f "bestaudio/best" -x --audio-format wav` 
            : `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4`;

        // Comando base con inyección de cookies y FFmpeg
        const cmdBase = `${ytDlpPath} ${cookieArg} --ffmpeg-location "${ffmpegPath}" --no-playlist --no-warnings --geo-bypass -o "${outName}.%(ext)s" ${format}`;

        const attempts = [
            `${cmdBase} --extractor-args "youtube:player_client=android" "${urlLimpia}"`,
            `${cmdBase} "${urlLimpia}"`
        ];

        let success = false;
        let lastError = "";

        for (const cmd of attempts) {
            try {
                await execPromise(cmd);
                if (fs.existsSync(`${outName}.${ext}`)) {
                    success = true;
                    break;
                }
            } catch (e) {
                lastError = e.stderr || e.message;
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        // Manejo de errores basado en la respuesta real del binario
        if (!success) {
            let errorMensaje = "❌ Error crítico.";
            if (lastError.includes("Permission denied")) errorMensaje = "❌ Error: El binario yt-dlp no tiene permisos de ejecución (chmod +x).";
            else if (lastError.includes("ffmpeg not found")) errorMensaje = "❌ Error: No se encontró FFmpeg en la raíz. YouTube/IG lo necesitan.";
            else if (lastError.includes("Sign in to confirm you are not a bot") || lastError.includes("403")) errorMensaje = "❌ YouTube detectó el bot. Verifica que 'youtube_cookies.txt' sea válido y no haya expirado.";
            else if (lastError.includes("login required") || lastError.includes("rate-limit")) errorMensaje = "❌ Instagram bloqueó la IP o las cookies son inválidas.";
            else errorMensaje = `❌ Error técnico:\n${lastError.substring(0, 200)}`;

            return sock.sendMessage(remitente, { text: errorMensaje, edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        const fileSizeInMB = fs.statSync(finalFile).size / (1024 * 1024);

        if (fileSizeInMB > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB (Límite: 50MB).`, edit: statusMsg.key });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando...", edit: statusMsg.key });
            
            const payload = isAudio 
                ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `Audio_${Date.now()}.wav` } 
                : { video: { url: finalFile }, mimetype: 'video/mp4' };

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, { text: "❌ Falló el envío del archivo a WhatsApp.", edit: statusMsg.key });
        } finally {
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
