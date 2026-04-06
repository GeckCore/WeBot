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
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando video con bypass..." }, { quoted: msg });

        const outName = `yt_${Date.now()}.mp4`;
        const cookiePath = './cookies.txt'; // Asegúrate de subir este archivo a tu servidor
        
        // Verificamos si existen cookies para usar el parámetro o no
        const cookieArg = fs.existsSync(cookiePath) ? `--cookies ${cookiePath}` : '';

        // Comando actualizado con cookies y manejo de errores de bot
        const cmd = `./yt-dlp ${cookieArg} -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]" --merge-output-format mp4 --ffmpeg-location ./ffmpeg --no-playlist --no-warnings -o "${outName}" "${url}"`;

        try {
            await execPromise(cmd);

            if (fs.existsSync(outName)) {
                const stats = fs.statSync(outName);
                const fileSizeMB = stats.size / (1024 * 1024);

                if (fileSizeMB > 60) {
                    throw new Error(`Video demasiado pesado (${fileSizeMB.toFixed(2)}MB).`);
                }

                await sock.sendMessage(remitente, { 
                    video: fs.readFileSync(`./${outName}`), 
                    caption: `✅ *YouTube Clean-View*\n📦 *Peso:* ${fileSizeMB.toFixed(2)} MB`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

            } else {
                throw new Error("No se generó el archivo de salida.");
            }

        } catch (err) {
            console.error("Error YT-DLP:", err.message);
            let errorMsg = "❌ *Error:* YouTube ha bloqueado la conexión. Se requiere actualizar las cookies.";
            if (err.message.includes("heavy")) errorMsg = "❌ El video supera los 60MB.";
            
            await sock.sendMessage(remitente, { text: errorMsg });
        } finally {
            if (fs.existsSync(outName)) fs.unlinkSync(outName);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
