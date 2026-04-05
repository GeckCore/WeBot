// plugins/downloads.js
const axios = require('axios');

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|ig\.me).*)/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const rawUrl = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Interceptando enlace..." }, { quoted: msg });

        try {
            // ==========================================
            // RUTA 1: TIKTOK (Motor TikWM - Intacto)
            // ==========================================
            if (rawUrl.includes('tiktok.com')) {
                const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(rawUrl)}&hd=1`);
                const data = res.data?.data;

                if (!data) throw new Error("El video es privado o fue eliminado.");

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo TikTok...", edit: statusMsg.key });

                if (data.images && data.images.length > 0) {
                    for (let img of data.images) {
                        await sock.sendMessage(remitente, { image: { url: img } });
                    }
                } else if (data.play) {
                    const videoUrl = data.hdplay || data.play; 
                    await sock.sendMessage(remitente, { video: { url: videoUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                }
                
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            } 
            
            // ==========================================
            // RUTA 2: INSTAGRAM (Limpieza de URL + Nodo Delirius)
            // ==========================================
            else if (rawUrl.includes('instagram.com') || rawUrl.includes('ig.me')) {
                // CORRECCIÓN VITAL: Cortar parámetros de rastreo (?igsh=) que rompen las descargas
                const cleanUrl = rawUrl.split('?')[0]; 
                const encodedUrl = encodeURIComponent(cleanUrl);
                let mediaList = [];

                // Cascada de APIs, poniendo Delirius como nodo principal (el más estable para IG)
                const igApis = [
                    async () => {
                        const res = await axios.get(`https://deliriussapi-oficial.vercel.app/download/instagram?url=${encodedUrl}`);
                        return res.data?.data; // Devuelve array de medios
                    },
                    async () => {
                        const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`);
                        return res.data?.data; 
                    },
                    async () => {
                        const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodedUrl}`);
                        return res.data?.data;
                    }
                ];

                for (const fetchApi of igApis) {
                    try {
                        const result = await fetchApi();
                        // Instagram devuelve arrays porque un post puede tener varias fotos o videos
                        if (result && Array.isArray(result) && result.length > 0) {
                            mediaList = result;
                            break; 
                        }
                    } catch (e) {
                        continue; // Si un nodo cae, pasa al siguiente en milisegundos
                    }
                }

                if (mediaList.length === 0) {
                    throw new Error("Servidores de extracción saturados o reel no disponible.");
                }

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo Instagram...", edit: statusMsg.key });

                for (let item of mediaList) {
                    // Adaptamos la lectura dependiendo del nodo que haya respondido
                    const dlUrl = item.url || item;
                    if (!dlUrl) continue;

                    // Si es video lo manda como mp4, si es imagen la manda como foto
                    if (dlUrl.includes('.mp4') || dlUrl.includes('video') || item.type === 'video') {
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
