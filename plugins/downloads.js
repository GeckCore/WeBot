const axios = require('axios');

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|ig\.me).*)/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const rawUrl = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1];
        const cleanUrl = rawUrl.split('?')[0]; 
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Procesando enlace..." }, { quoted: msg });

        try {
            // --- LÓGICA TIKTOK (TikWM) ---
            if (cleanUrl.includes('tiktok.com')) {
                const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}&hd=1`);
                const data = res.data?.data;

                if (!data) throw new Error("No se pudo obtener el contenido de TikTok.");

                await sock.sendMessage(remitente, { text: "🚀 Enviando TikTok...", edit: statusMsg.key });

                if (data.images && data.images.length > 0) {
                    for (const img of data.images) {
                        await sock.sendMessage(remitente, { image: { url: img } });
                    }
                } else {
                    const videoUrl = data.hdplay || data.play;
                    await sock.sendMessage(remitente, { video: { url: videoUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                }
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            }

            // --- LÓGICA INSTAGRAM (Cascada de APIs) ---
            if (cleanUrl.includes('instagram.com') || cleanUrl.includes('ig.me')) {
                const encodedUrl = encodeURIComponent(cleanUrl);
                let mediaList = [];

                const igApis = [
                    async () => (await axios.get(`https://deliriussapi-oficial.vercel.app/download/instagram?url=${encodedUrl}`)).data?.data,
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`)).data?.data,
                    async () => (await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodedUrl}`)).data?.result
                ];

                for (const fetchApi of igApis) {
                    try {
                        const result = await fetchApi();
                        if (result && Array.isArray(result) && result.length > 0) {
                            mediaList = result;
                            break;
                        } else if (result && result.url) {
                            mediaList = [result];
                            break;
                        }
                    } catch (e) { continue; }
                }

                if (mediaList.length === 0) throw new Error("Servidores de Instagram saturados.");

                await sock.sendMessage(remitente, { text: "🚀 Enviando Instagram...", edit: statusMsg.key });

                for (const item of mediaList) {
                    const dlUrl = item.url || item;
                    if (dlUrl.includes('.mp4') || dlUrl.includes('video') || item.type === 'video') {
                        await sock.sendMessage(remitente, { video: { url: dlUrl }, mimetype: 'video/mp4' });
                    } else {
                        await sock.sendMessage(remitente, { image: { url: dlUrl } });
                    }
                }
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            }

        } catch (error) {
            return sock.sendMessage(remitente, { text: `❌ Error: ${error.message}`, edit: statusMsg.key });
        }
    }
};
