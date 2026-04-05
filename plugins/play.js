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

        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando "${query}" en YouTube...` });

        try {
            // 1. Busqueda en YouTube
            const searchRes = await yts({ query, hl: 'es', gl: 'ES' });
            const video = searchRes.videos[0];

            if (!video) {
                return sock.sendMessage(remitente, { text: "❌ No se encontraron resultados.", edit: statusMsg.key });
            }

            // 2. Enviar Info y Miniatura
            const infoTexto = `📌 *${video.title}*\n` +
                              `⏱️ *Duración:* ${video.timestamp}\n` +
                              `👀 *Vistas:* ${video.views.toLocaleString()}\n` +
                              `👤 *Canal:* ${video.author.name}\n` +
                              `🔗 *Link:* ${video.url}\n\n` +
                              `⏳ *Descargando ${isVideo ? 'Video' : 'Audio'}...*`;

            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            // 3. Configuración de descarga con ./yt-dlp
            const idStr = Date.now().toString();
            const ext = isVideo ? 'mp4' : 'mp3';
            const outputPath = path.join(__dirname, `../temp/play_${idStr}.${ext}`);
            
            // Bypass para evitar bloqueos de YouTube (usando el cliente de Android)
            const format = isVideo 
                ? '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4'
                : '-f "bestaudio/best" -x --audio-format mp3';
            
            const cmd = `./yt-dlp --no-playlist --no-warnings ${format} -o "${outputPath}" "${video.url}" --extractor-args "youtube:player_client=android"`;

            // 4. Ejecutar descarga
            await execPromise(cmd);

            if (!fs.existsSync(outputPath)) {
                throw new Error("El archivo no se generó.");
            }

            // 5. Verificar tamaño (50MB límite)
            const stats = fs.statSync(outputPath);
            const fileSizeMB = stats.size / (1024 * 1024);

            if (fileSizeMB > 50) {
                fs.unlinkSync(outputPath);
                return sock.sendMessage(remitente, { text: `⚠️ El archivo es demasiado grande (${fileSizeMB.toFixed(1)}MB). El límite son 50MB.` });
            }

            // 6. Enviar a WhatsApp
            if (isVideo) {
                await sock.sendMessage(remitente, { 
                    video: { url: outputPath }, 
                    mimetype: 'video/mp4',
                    caption: `✅ ${video.title}`
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    audio: { url: outputPath }, 
                    mimetype: 'audio/mpeg',
                    fileName: `${video.title}.mp3`
                }, { quoted: msg });
            }

            // Limpieza
            fs.unlinkSync(outputPath);

        } catch (error) {
            console.error(error);
            await sock.sendMessage(remitente, { text: `❌ Error técnico: ${error.message.substring(0, 80)}` });
        }
    }
};
