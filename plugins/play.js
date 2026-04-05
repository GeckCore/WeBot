// plugins/play.js
const yts = require('yt-search');
const axios = require('axios');

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
            // 1. Búsqueda en YouTube
            const searchRes = await yts({ query, hl: 'es', gl: 'ES' });
            const video = searchRes.videos[0];

            if (!video) {
                return sock.sendMessage(remitente, { text: "❌ Sin resultados.", edit: statusMsg.key });
            }

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Conectando a nodos de extracción externa...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            const url = video.url;
            let finalUrl = null;

            // 2. Batería de APIs con extracción específica de JSON
            const apis = [
                // Nodo 1: Siputzx (Muy estable para bots WA)
                async () => {
                    const ep = isVideo ? 'ytmp4' : 'ytmp3';
                    const res = await axios.get(`https://api.siputzx.my.id/api/d/${ep}?url=${encodeURIComponent(url)}`);
                    return res.data?.data?.dl;
                },
                // Nodo 2: Ryzendesu
                async () => {
                    const ep = isVideo ? 'ytmp4' : 'ytmp3';
                    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/${ep}?url=${encodeURIComponent(url)}`);
                    return res.data?.url;
                },
                // Nodo 3: Vreden
                async () => {
                    const ep = isVideo ? 'ytmp4' : 'ytmp3';
                    const res = await axios.get(`https://api.vreden.web.id/api/${ep}?url=${encodeURIComponent(url)}`);
                    return res.data?.result?.download?.url;
                },
                // Nodo 4: Agatz
                async () => {
                    const ep = isVideo ? 'ytmp4' : 'ytmp3';
                    const res = await axios.get(`https://api.agatz.xyz/api/${ep}?url=${encodeURIComponent(url)}`);
                    return res.data?.data?.downloadUrl;
                }
            ];

            // 3. Ejecutar peticiones hasta que una devuelva un enlace válido
            for (const fetchApi of apis) {
                try {
                    const dlUrl = await fetchApi();
                    if (dlUrl && typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
                        finalUrl = dlUrl;
                        break; // Tenemos el enlace, cortamos el bucle
                    }
                } catch (e) {
                    continue; // Error de red o saturación, pasa al siguiente nodo
                }
            }

            if (!finalUrl) {
                return sock.sendMessage(remitente, { text: `❌ Todos los nodos externos están saturados por YouTube. Intenta de nuevo más tarde.`, edit: statusMsg.key });
            }

            await sock.sendMessage(remitente, { text: "🚀 Transmitiendo al chat...", edit: statusMsg.key });

            // 4. Enviar resultado
            if (isVideo) {
                await sock.sendMessage(remitente, { video: { url: finalUrl }, mimetype: 'video/mp4', caption: `✅ ${video.title}` }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { audio: { url: finalUrl }, mimetype: 'audio/mpeg' }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error("ERROR PLUGIN PLAY:", error.message);
            await sock.sendMessage(remitente, { text: `❌ Error interno: ${error.message}` });
        }
    }
};
