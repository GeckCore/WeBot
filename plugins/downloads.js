// plugins/downloads.js
const axios = require('axios');

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|ig\.me).*)/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const rawUrl = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Interceptando enlace..." }, { quoted: msg });

        const axiosConfig = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 15000 
        };

        try {
            // RUTA 1: TIKTOK
            if (rawUrl.includes('tiktok.com')) {
                const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(rawUrl)}&hd=1`, axiosConfig);
                const data = res.data?.data;
                if (!data) throw new Error("El video es privado o fue eliminado.");

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo TikTok...", edit: statusMsg.key });

                if (data.images && data.images.length > 0) {
                    for (let img of data.images) {
                        await sock.sendMessage(remitente, { image: { url: img } });
                    }
                } else if (data.play) {
                    await sock.sendMessage(remitente, { video: { url: data.hdplay || data.play }, mimetype: 'video/mp4' }, { quoted: msg });
                }
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            } 
            
            // RUTA 2: INSTAGRAM
            else if (rawUrl.includes('instagram.com') || rawUrl.includes('ig.me')) {
                const cleanUrl = rawUrl.split('?')[0]; 
                const encodedUrl = encodeURIComponent(cleanUrl);
                let mediaList = [];

                // Cascada de nodos actualizada (Abril 2026)
                const igApis = [
                    async () => (await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodedUrl}`, axiosConfig)).data?.result,
                    async () => (await axios.get(`https://widipe.com/download/igdl?url=${encodedUrl}`, axiosConfig)).data?.result,
                    async () => (await axios.get(`https://api.agungny.my.id/api/igdl?url=${encodedUrl}`, axiosConfig)).data?.result,
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`, axiosConfig)).data?.data,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodedUrl}`, axiosConfig)).data?.data
                ];

                for (let i = 0; i < igApis.length; i++) {
                    try {
                        let result = await igApis[i]();
                        if (!result) continue;

                        // Normalización robusta
                        if (Array.isArray(result)) {
                            mediaList = result.map(i => typeof i === 'string' ? i : (i.url || i.download_link || i.videoUrl));
                        } else if (typeof result === 'object') {
                            const singleUrl = result.url || result.download_link || result.videoUrl || result[0]?.url;
                            if (singleUrl) mediaList = [singleUrl];
                        }

                        if (mediaList.length > 0 && mediaList[0]) break;
                    } catch (e) {
                        console.log(`[INFO] Nodo IG ${i + 1} falló.`);
                        continue; 
                    }
                }

                if (mediaList.length === 0 || !mediaList[0]) {
                    throw new Error("Insta-Shield activo. Todos los nodos saturados o IP bloqueada.");
                }

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo Instagram...", edit: statusMsg.key });

                for (let dlUrl of mediaList) {
                    if (!dlUrl || typeof dlUrl !== 'string') continue;
                    
                    const isVideo = dlUrl.includes('.mp4') || dlUrl.includes('video') || dlUrl.includes('fbcdn.net'); // IG usa fbcdn para videos
                    
                    if (isVideo) {
                        await sock.sendMessage(remitente, { video: { url: dlUrl }, mimetype: 'video/mp4' });
                    } else {
                        await sock.sendMessage(remitente, { image: { url: dlUrl } });
                    }
                }
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            }

        } catch (error) {
            console.error("[ERROR DOWNLOADER]:", error.message);
            return sock.sendMessage(remitente, { text: `❌ Falla de extracción.\n\n*Motivo:* ${error.message}`, edit: statusMsg.key });
        }
    }
};
