// plugins/play.js
const yts = require('yt-search');

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
            // 1. Búsqueda (Esto no lo bloquea YouTube)
            const searchRes = await yts({ query, hl: 'es', gl: 'ES' });
            const video = searchRes.videos[0];

            if (!video) {
                return sock.sendMessage(remitente, { text: "❌ Sin resultados.", edit: statusMsg.key });
            }

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Extrayendo desde servidores externos...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            // 2. Lista de APIs externas para saltar el bloqueo de IP de la VPS
            const encodedUrl = encodeURIComponent(video.url);
            const apis = isVideo ? [
                `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodedUrl}`,
                `https://api.dorratz.com/v2/yt-mp4?url=${encodedUrl}`,
                `https://ruby-core.vercel.app/api/download/youtube/mp4?url=${encodedUrl}`
            ] : [
                `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodedUrl}`,
                `https://api.dorratz.com/v2/yt-mp3?url=${encodedUrl}`,
                `https://ruby-core.vercel.app/api/download/youtube/mp3?url=${encodedUrl}`
            ];

            let finalUrl = null;

            // 3. Iterar sobre las APIs hasta que una funcione
            for (const api of apis) {
                try {
                    const res = await fetch(api);
                    if (!res.ok) continue;
                    
                    const json = await res.json();
                    
                    // Extraer la URL de descarga según la estructura de la API
                    finalUrl = json?.url || json?.data?.url || json?.download?.url || json?.result?.url || json?.data?.download;
                    
                    if (finalUrl) break; 
                } catch (e) {
                    continue; // Falla silenciosamente y prueba la siguiente
                }
            }

            if (!finalUrl) {
                return sock.sendMessage(remitente, { text: `❌ Las APIs de extracción están saturadas. Inténtalo en unos minutos.`, edit: statusMsg.key });
            }

            // 4. Enviar directamente a WhatsApp (Baileys procesa la URL sin guardarla en disco)
            await sock.sendMessage(remitente, { text: "🚀 Transmitiendo archivo...", edit: statusMsg.key });

            if (isVideo) {
                await sock.sendMessage(remitente, { video: { url: finalUrl }, mimetype: 'video/mp4', caption: `✅ ${video.title}` }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { audio: { url: finalUrl }, mimetype: 'audio/mpeg' }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(remitente, { text: `❌ Error en el proceso: ${error.message}` });
        }
    }
};
