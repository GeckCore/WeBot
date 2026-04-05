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

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Procesando ${isVideo ? 'Video' : 'Audio'}...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            const idStr = Date.now().toString();
            const ext = isVideo ? 'mp4' : 'mp3';
            const outputPath = path.join(__dirname, `../play_${idStr}.${ext}`);
            
            // Selector de formato restaurado a la configuración óptima para Android/Web
            const format = isVideo 
                ? '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/b[ext=mp4]/b"' 
                : '-f "bestaudio/best"';
            
            const cookiePath = './cookies.txt';
            const cookieArg = fs.existsSync(cookiePath) ? `--cookies ${cookiePath}` : '';
            
            // Se inyecta --rm-cache-dir para limpiar bloqueos previos y se fuerza el cliente Android
            const cmd = `./yt-dlp --rm-cache-dir -4 --geo-bypass --no-playlist --no-warnings --no-check-certificate ${format} -x --audio-format mp3 --ffmpeg-location ./ffmpeg ${cookieArg} --extractor-args "youtube:player_client=android" -o "${outputPath}" "${video.url}"`;

            const finalCmd = isVideo ? cmd.replace('-x --audio-format mp3', '') : cmd;

            await execPromise(finalCmd);

            if (!fs.existsSync(outputPath)) {
                throw new Error("YouTube bloqueó la IP mediante la API de Android.");
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
            console.error("DEBUG LOG:", error);
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico de extracción. La mitigación de Android/Cookies ha sido rechazada por el servidor.` });
        }
    }
};
