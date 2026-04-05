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
            
            // --- CONFIGURACIÓN DE SELECCIÓN DE FORMATO RELAJADA ---
            // 'ba/b' le dice: "Dame el mejor audio, y si no lo encuentras en la lista 'capada', dame lo mejor que haya"
            const format = isVideo 
                ? '-f "ba+bv/b"' 
                : '-f "ba/b"';
            
            const cookiePath = './cookies.txt';
            const cookieArg = fs.existsSync(cookiePath) ? `--cookies ${cookiePath}` : '';
            
            // --- COMANDO REFORZADO PARA VPS ---
            // -4: Fuerza IPv4 (Mucho más estable en VPS que IPv6)
            // --geo-bypass: Intenta saltar restricciones geográficas
            // --user-agent: Simulamos un navegador real de Windows
            const cmd = `./yt-dlp -4 --geo-bypass --no-playlist --no-warnings --no-check-certificate --no-cache-dir ${format} -x --audio-format mp3 --ffmpeg-location ./ffmpeg ${cookieArg} --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36" -o "${outputPath}" "${video.url}"`;

            const finalCmd = isVideo ? cmd.replace('-x --audio-format mp3', '') : cmd;

            await execPromise(finalCmd);

            if (!fs.existsSync(outputPath)) {
                throw new Error("YouTube bloqueó la IP o el formato no es procesable.");
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
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico. YouTube está limitando tu VPS. Intenta con otra canción o actualiza tus cookies.` });
        }
    }
};
