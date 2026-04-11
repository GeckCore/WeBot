const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'ig',
    match: (text) => /^ig\s+(https?:\/\/(www\.)?instagram\.com\/[^\s]+)$/i.test(text),

    execute: async ({ sock, remitente, textoLimpio }) => {
        const urlMatch = textoLimpio.match(/^ig\s+(https?:\/\/(www\.)?instagram\.com\/[^\s]+)$/i);
        if (!urlMatch) return;

        let urlLimpia = urlMatch[1].split('?')[0];
        if (!urlLimpia.endsWith('/')) urlLimpia += '/';

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando historia de Instagram..." });

        const outDir = path.join(__dirname, '../');
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');
        const igCookies = path.join(__dirname, '../instagram_cookies.txt');
        const logPath = path.join(__dirname, '../ig_error.log');

        if (!fs.existsSync(igCookies)) {
            return sock.sendMessage(remitente, {
                text: "❌ No se encontró el archivo de cookies.",
                edit: statusMsg.key
            });
        }

        // Nombre único para saber exactamente qué archivo buscar
        const uniqueId = `ig_${Date.now()}`;
        const cookieArg = `--cookies "${igCookies}"`;

        // Sin --no-playlist para que funcione correctamente con stories
        const cmd = `${ytDlpPath} ${cookieArg} --ffmpeg-location "${ffmpegPath}" --no-warnings --geo-bypass -P "${outDir}" -o "${uniqueId}.%(ext)s" "${urlLimpia}"`;

        let success = false;
        let finalFile = null;
        let lastError = "";

        try {
            const { stdout, stderr } = await execPromise(cmd);

            await new Promise(r => setTimeout(r, 1500));

            fs.writeFileSync(logPath, JSON.stringify({ urlLimpia, cmd, stdout, stderr }, null, 2));

            // Buscar archivo con el uniqueId en vez de comparar snapshots
            const archivos = fs.readdirSync(outDir);
            const encontrado = archivos.find(f => f.startsWith(uniqueId));

            if (encontrado) {
                finalFile = path.join(outDir, encontrado);
                success = true;
            } else {
                lastError = `yt-dlp no generó archivo nuevo.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`;
            }

        } catch (e) {
            lastError = e.stderr || e.stdout || e.message || "Error desconocido";
            fs.writeFileSync(logPath, JSON.stringify({
                urlLimpia, cmd,
                message: e.message,
                stderr: e.stderr,
                stdout: e.stdout,
                code: e.code
            }, null, 2));
        }

        if (!success || !finalFile) {
            let errorMensaje = "";
            if (lastError.includes("login") || lastError.includes("authentication") || lastError.includes("cookie")) {
                errorMensaje = "❌ Las cookies han expirado o son inválidas.";
            } else if (lastError.includes("Video unavailable") || lastError.includes("Private")) {
                errorMensaje = "❌ Historia privada, expirada o no disponible.";
            } else {
                errorMensaje = `❌ Error técnico:\n[${lastError.substring(0, 500)}]`;
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

            const isVideo = finalFile.endsWith('.mp4') || finalFile.endsWith('.mov') || finalFile.endsWith('.m4v');
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
