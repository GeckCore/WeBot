// plugins/play.js
const yts = require('yt-search');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'play',
    match: (text) => /^(play2?|video|audio)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const match = textoLimpio.match(/^(play2?|video|audio)\s+(.+)$/i);
        const command = match[1].toLowerCase();
        const query = match[2].trim();
        const isVideo = (command === 'play2' || command === 'video');

        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando "${query}"...` });

        try {
            const searchRes = await yts({ query, hl: 'es', gl: 'ES' });
            const video = searchRes.videos[0];

            if (!video) {
                return sock.sendMessage(remitente, { text: "❌ Sin resultados.", edit: statusMsg.key });
            }

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Descargando...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            const idStr = Date.now().toString();
            const ext = isVideo ? 'mp4' : 'mp3';
            const outputPath = path.join(__dirname, `../play_${idStr}.${ext}`);
            
            const format = isVideo 
                ? '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4'
                : '-f "bestaudio/best" -x --audio-format mp3';
            
            // --- COMANDO ACTUALIZADO CON COOKIES ---
            // 1. Usamos --cookies ./cookies.txt para saltar el bloqueo de bot
            // 2. Mantenemos --ffmpeg-location para la conversión
            const cookiePath = './cookies.txt';
            const cookieArg = fs.existsSync(cookiePath) ? `--cookies ${cookiePath}` : '';
            
            const cmd = `./yt-dlp --no-playlist --no-warnings ${format} --ffmpeg-location ./ffmpeg ${cookieArg} -o "${outputPath}" "${video.url}"`;

            await execPromise(cmd);

            if (!fs.existsSync(outputPath)) {
                throw new Error("YouTube sigue bloqueando la conexión. Actualiza el archivo cookies.txt.");
            }

            const stats = fs.statSync(outputPath);
            if (stats.size / (1024 * 1024) > 50) {
                fs.unlinkSync(outputPath);
                return sock.sendMessage(remitente, { text: `⚠️ El archivo supera los 50MB.` });
            }

            if (isVideo) {
                await sock.sendMessage(remitente, { video: { url: outputPath }, mimetype: 'video/mp4', caption: `✅ ${video.title}` }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { audio: { url: outputPath }, mimetype: 'audio/mpeg', fileName: `${video.title}.mp3` }, { quoted: msg });
            }

            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error(error);
            const errorFriendly = error.message.includes('Sign in') 
                ? "YouTube detectó el bot. Sube un nuevo archivo 'cookies.txt' al panel."
                : error.message.substring(0, 80);
            await sock.sendMessage(remitente, { text: `❌ Error: ${errorFriendly}` });
        }
    }
};
