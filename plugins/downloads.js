const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio }) => {
        // Limpieza de URL
        const urlMatch = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i);
        if (!urlMatch) return;
        
        let urlLimpia = urlMatch[1].split(/[?&]si=/)[0].split(/[&?]feature=/)[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando enlace..." });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const outName = path.join(__dirname, `../dl_${Date.now()}`);
        const ext = isAudio ? 'wav' : 'mp4';
        
        // Rutas absolutas para evitar fallos de contexto en contenedores
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');

        // Configuración de formato (Aseguramos compatibilidad con FFmpeg si existe)
        const format = isAudio 
            ? `-f "bestaudio/best" -x --audio-format wav` 
            : `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4`;

        const cmdBase = `${ytDlpPath} --ffmpeg-location ${ffmpegPath} --no-playlist --no-warnings -o "${outName}.%(ext)s" ${format}`;

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
                // Limpiar basura si falló a medias
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) {
            let errorMensaje = "❌ Error en la descarga.";
            if (lastError.includes("Permission denied")) errorMensaje = "❌ Error: yt-dlp no tiene permisos (chmod +x).";
            else if (lastError.includes("ffmpeg not found")) errorMensaje = "❌ Error: Falta el binario 'ffmpeg' en la raíz para procesar este sitio.";
            else if (lastError.includes("403") || lastError.includes("Sign in")) errorMensaje = "❌ Error: YouTube/IG bloqueó la petición. Actualiza yt-dlp.";
            else errorMensaje = `❌ Error técnico: ${lastError.substring(0, 150)}...`;

            return sock.sendMessage(remitente, { text: errorMensaje, edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        const stats = fs.statSync(finalFile);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo es demasiado grande (${fileSizeInMB.toFixed(1)}MB). Límite: 50MB.`, edit: statusMsg.key });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando archivo...", edit: statusMsg.key });
            
            const payload = isAudio 
                ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `Audio_${Date.now()}.wav` } 
                : { video: { url: finalFile }, mimetype: 'video/mp4' };

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, { text: "❌ Error al enviar el archivo al chat.", edit: statusMsg.key });
        } finally {
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
