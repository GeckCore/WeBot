const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'youtube_dl',
    // Detecta links de youtube.com o youtu.be
    match: (text) => /^(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+)/i.test(text) 
                    && !text.includes('instagram.com') 
                    && !text.includes('tiktok.com'),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        // Limpiamos el link de parámetros innecesarios (?si=...)
        const url = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1].split('?si=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Extrayendo video de YouTube (Sin anuncios)..." }, { quoted: msg });

        const outName = `yt_${Date.now()}.mp4`;
        
        // Comando técnico:
        // -f: Busca el mejor video mp4 de hasta 720p + mejor audio m4a para asegurar compatibilidad.
        // --merge-output-format: Fuerza el contenedor mp4.
        const cmd = `./yt-dlp -f "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist --no-warnings -o "${outName}" "${url}"`;

        try {
            await execPromise(cmd);

            if (fs.existsSync(outName)) {
                const stats = fs.statSync(outName);
                const fileSizeMB = stats.size / (1024 * 1024);

                // Límite de seguridad para la RAM de la VPS y WhatsApp
                if (fileSizeMB > 64) {
                    throw new Error(`El archivo pesa ${fileSizeMB.toFixed(2)}MB. Supera el límite de envío fluido.`);
                }

                await sock.sendMessage(remitente, { 
                    video: fs.readFileSync(`./${outName}`), 
                    caption: `✅ *YouTube Clean-View*\n📦 *Tamaño:* ${fileSizeMB.toFixed(2)} MB\n\n_Video extraído sin publicidad._`,
                    mimetype: 'video/mp4'
                }, { quoted: msg });

            } else {
                throw new Error("No se pudo localizar el archivo final.");
            }

        } catch (err) {
            console.error("Error YT-DLP:", err.message);
            await sock.sendMessage(remitente, { text: `❌ *Fallo en la extracción:* \n${err.message}` });
        } finally {
            // Limpieza de disco obligatoria en VPS
            if (fs.existsSync(outName)) fs.unlinkSync(outName);
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
