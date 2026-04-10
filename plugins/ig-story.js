const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'igstory',
    // Regex: Detecta "ig " seguido obligatoriamente de un enlace de historias de instagram
    match: (text) => /^ig\s+(https?:\/\/(www\.)?instagram\.com\/stories\/[^\s]+)$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlMatch = textoLimpio.match(/^ig\s+(https?:\/\/(www\.)?instagram\.com\/stories\/[^\s]+)$/i);
        if (!urlMatch) return;
        
        // Limpiamos parámetros de rastreo (?igsh=) que pueden causar errores de autenticación
        let urlLimpia = urlMatch[1].split(/[?&]igsh=/)[0].split(/[?&]utm_source=/)[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando historia de IG con cookies..." });

        const timestamp = Date.now();
        const outPrefix = path.join(__dirname, `../dl_story_${timestamp}`);
        
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');

        // Validar cookies: Son obligatorias para las historias
        if (!fs.existsSync(igCookies)) {
            return sock.sendMessage(remitente, { text: "❌ Error: No se encontró `instagram_cookies.txt` en la raíz. Es obligatorio para acceder a las historias.", edit: statusMsg.key });
        }

        const cookieArg = `--cookies "${igCookies}"`;
        // Usamos %(ext)s porque la historia puede ser un video (.mp4) o una foto (.jpg/.webp)
        const cmd = `${ytDlpPath} ${cookieArg} --ffmpeg-location "${ffmpegPath}" --no-playlist --no-warnings -o "${outPrefix}.%(ext)s" "${urlLimpia}"`;

        let success = false;
        let lastError = "";
        let finalFile = "";

        try {
            await execPromise(cmd);
            
            // Buscar el archivo resultante en el directorio padre (ya que no sabemos la extensión exacta)
            const parentDir = path.join(__dirname, '../');
            const files = fs.readdirSync(parentDir);
            const downloadedFile = files.find(f => f.startsWith(`dl_story_${timestamp}`));
            
            if (downloadedFile) {
                success = true;
                finalFile = path.join(parentDir, downloadedFile);
            }
        } catch (e) {
            lastError = e.stderr || e.message;
        }

        if (!success || !finalFile) {
            let errorMensaje = "❌ Error al descargar la historia.";
            if (lastError.includes("Login required") || lastError.includes("Redirected to login")) {
                errorMensaje = "❌ Error: Las cookies expiraron o Instagram bloqueó la sesión (Challenge Required). Debes renovar instagram_cookies.txt.";
            } else if (lastError.includes("No video formats")) {
                errorMensaje = "❌ Error: Historia no disponible (pudo expirar o la cuenta es privada y tus cookies no la siguen).";
            } else {
                errorMensaje = `❌ Error técnico:\n${lastError.substring(0, 150)}`;
            }
            return sock.sendMessage(remitente, { text: errorMensaje, edit: statusMsg.key });
        }

        const stats = fs.statSync(finalFile);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB. Límite de WhatsApp: 50MB.`, edit: statusMsg.key });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando...", edit: statusMsg.key });
            
            // Determinar si enviamos un vídeo o una imagen según la extensión
            let payload = {};
            if (finalFile.endsWith('.mp4') || finalFile.endsWith('.webm')) {
                payload = { video: { url: finalFile }, mimetype: 'video/mp4' };
            } else {
                payload = { image: { url: finalFile } };
            }

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, { text: "❌ Error al subir la historia a WhatsApp.", edit: statusMsg.key });
        } finally {
            // Limpieza del archivo temporal
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
