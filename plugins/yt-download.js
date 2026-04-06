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
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Extrayendo flujo de datos..." }, { quoted: msg });

        const outName = `yt_${Date.now()}.mp4`;
        
        // COMANDO CORREGIDO:
        // 1. "f": Selecciona el mejor video de hasta 720p y el mejor audio.
        // 2. "--merge-output-format mp4": Une ambos en un MP4.
        // 3. "--ffmpeg-location ./ffmpeg": INDISPENSABLE. Usa tu binario para la unión.
        const cmd = `./yt-dlp -f "best[height<=720]" --merge-output-format mp4 --ffmpeg-location ./ffmpeg --no-playlist --no-warnings -o "${outName}" "${url}"`;

        try {
            await execPromise(cmd);

            if (fs.existsSync(outName)) {
                const stats = fs.statSync(outName);
                const fileSizeMB = stats.size / (1024 * 1024);

                if (fileSizeMB > 60) {
                    throw new Error(`Video demasiado pesado (${fileSizeMB.toFixed(2)}MB). El límite de WhatsApp es ~60MB.`);
                }

                await sock.sendMessage(remitente, { 
                    video: fs.readFileSync(`./${outName}`), 
                    caption: `✅ *YouTube Clean-View*\n📦 *Peso:* ${fileSizeMB.toFixed(2)} MB\n\n_Sin anuncios y optimizado para estudio._`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

            } else {
                throw new Error("FFmpeg no pudo procesar el contenedor MP4.");
            }

        } catch (err) {
            console.error("Error YT-DLP:", err.message);
            await sock.sendMessage(remitente, { text: `❌ *Error técnico:* \nYouTube ha cambiado el formato de este video o la VPS no tiene RAM para procesarlo.` });
        } finally {
            if (fs.existsSync(outName)) fs.unlinkSync(outName);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
