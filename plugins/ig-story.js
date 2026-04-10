const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'ig',
    // Reacciona cuando el mensaje empieza con "ig " seguido de un link de instagram
    match: (text) => /^ig\s+(https?:\/\/(www\.)?instagram\.com\/[^\s]+)$/i.test(text),

    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlMatch = textoLimpio.match(/^ig\s+(https?:\/\/(www\.)?instagram\.com\/[^\s]+)$/i);
        if (!urlMatch) return;

        let urlLimpia = urlMatch[1].split(/[?&]si=/)[0].split(/[&?]feature=/)[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando historia de Instagram..." });

        const outName = path.join(__dirname, `../ig_${Date.now()}`);
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');

        let cookieArg = "";
        if (fs.existsSync(igCookies)) {
            cookieArg = `--cookies "${igCookies}"`;
        } else {
            return sock.sendMessage(remitente, {
                text: "❌ No se encontró el archivo de cookies. Necesario para descargar historias.",
                edit: statusMsg.key
            });
        }

        // Las historias pueden ser video o imagen, dejamos que yt-dlp elija
        const cmd = `${ytDlpPath} ${cookieArg} --ffmpeg-location "${ffmpegPath}" --no-playlist --no-warnings --geo-bypass -o "${outName}.%(ext)s" "${urlLimpia}"`;

        let success = false;
        let finalFile = null;
        let lastError = "";

        try {
            await execPromise(cmd);

            // Buscar el archivo descargado (puede ser mp4, jpg, webp, etc.)
            const posiblesExts = ['mp4', 'jpg', 'jpeg', 'webp', 'png'];
            for (const ext of posiblesExts) {
                if (fs.existsSync(`${outName}.${ext}`)) {
                    finalFile = `${outName}.${ext}`;
                    success = true;
                    break;
                }
            }
        } catch (e) {
            lastError = e.stderr || e.message;
        }

        if (!success || !finalFile) {
            let errorMensaje = "❌ Error al procesar la historia.";
            if (lastError.includes("Video unavailable") || lastError.includes("Private")) {
                errorMensaje = "❌ Historia privada, expirada o no disponible.";
            } else if (lastError.includes("login") || lastError.includes("authentication")) {
                errorMensaje = "❌ Las cookies han expirado. Actualiza el archivo de cookies.";
            } else {
                errorMensaje = `❌ Error técnico:\n${lastError.substring(0, 150)}`;
            }
            return sock.sendMessage(remitente, { text: errorMensaje, edit: statusMsg.key });
        }

        const stats = fs.statSync(finalFile);
        const fileSizeInMB = stats.size / (1024 * 1024);

        if (fileSizeInMB > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, {
                text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB. Límite de WhatsApp: 50MB.`,
                edit: statusMsg.key
            });
        }

        try {
            await sock.sendMessage(remitente, { text: "🚀 Enviando historia...", edit: statusMsg.key });

            const isVideo = finalFile.endsWith('.mp4');
            const payload = isVideo
                ? { video: { url: finalFile }, mimetype: 'video/mp4' }
                : { image: { url: finalFile } };

            await sock.sendMessage(remitente, payload);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        } catch (sendError) {
            await sock.sendMessage(remitente, {
                text: "❌ Error al subir la historia a WhatsApp.",
                edit: statusMsg.key
            });
        } finally {
            if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
        }
    }
};
