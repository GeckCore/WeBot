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

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Descargando ${isVideo ? 'Video' : 'Audio'}...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            const idStr = Date.now().toString();
            const ext = isVideo ? 'mp4' : 'mp3';
            const outputPath = path.join(__dirname, `../play_${idStr}.${ext}`);
            
            // --- CONFIGURACIÓN DE FORMATO ULTRA-COMPATIBLE ---
            // Si falla el "bestaudio", intentamos que baje "lo que sea" y lo convierta
            const format = isVideo 
                ? '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"'
                : '-f "bestaudio/best"'; // Dejamos que yt-dlp elija lo mejor disponible
            
            const cookiePath = './cookies.txt';
            const cookieArg = fs.existsSync(cookiePath) ? `--cookies ${cookiePath}` : '';
            
            // --- COMANDO REFORZADO ---
            // 1. Usamos el cliente 'web' y 'ios' para evitar el "downgraded player"
            // 2. --no-cache-dir evita que yt-dlp guarde errores de sesiones anteriores
            const cmd = `./yt-dlp --no-playlist --no-warnings --no-check-certificate --no-cache-dir ${format} -x --audio-format mp3 --ffmpeg-location ./ffmpeg ${cookieArg} --extractor-args "youtube:player_client=ios,web" -o "${outputPath}" "${video.url}"`;

            // En caso de video, quitamos el -x (extract audio)
            const finalCmd = isVideo ? cmd.replace('-x --audio-format mp3', '') : cmd;

            await execPromise(finalCmd);

            if (!fs.existsSync(outputPath)) {
                throw new Error("El archivo no se pudo crear. Intenta con otra canción.");
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
            console.error("ERROR LOG:", error);
            await sock.sendMessage(remitente, { text: `❌ Error: El formato no está disponible para esta IP o el enlace está restringido.` });
        }
    }
};
