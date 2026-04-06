const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'youtube_dl',
    match: (text) => /^(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+)/i.test(text) 
                    && !text.includes('instagram.com') 
                    && !text.includes('tiktok.com'),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const url = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1].split('?si=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Bypass de seguridad en curso..." }, { quoted: msg });

        const outName = `yt_${Date.now()}.mp4`;
        // Usamos path.resolve para asegurar que la ruta sea correcta para el binario
        const cookiePath = path.resolve(__dirname, '../../cookies.txt'); 
        const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        if (!fs.existsSync(cookiePath)) {
            console.error("ALERTA: Archivo cookies.txt no encontrado en:", cookiePath);
        }

        // Comando con Cookies, User-Agent y bypass de cliente
        const cmd = `./yt-dlp --cookies "${cookiePath}" --user-agent "${userAgent}" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]" --merge-output-format mp4 --ffmpeg-location ./ffmpeg --no-playlist --no-warnings -o "${outName}" "${url}"`;

        try {
            await execPromise(cmd);

            if (fs.existsSync(outName)) {
                const stats = fs.statSync(outName);
                const fileSizeMB = stats.size / (1024 * 1024);

                if (fileSizeMB > 60) throw new Error("Too heavy");

                await sock.sendMessage(remitente, { 
                    video: fs.readFileSync(`./${outName}`), 
                    caption: `✅ *YouTube Clean-View*\n📦 *Peso:* ${fileSizeMB.toFixed(2)} MB`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

            } else {
                throw new Error("No file generated");
            }

        } catch (err) {
            console.error("Error YT-DLP:", err.message);
            await sock.sendMessage(remitente, { text: `❌ *Fallo de autenticación:* YouTube detecta el servidor como bot. Actualiza el archivo cookies.txt o cambia el User-Agent.` });
        } finally {
            if (fs.existsSync(outName)) fs.unlinkSync(outName);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
