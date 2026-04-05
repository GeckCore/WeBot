// plugins/downloads.js
const axios = require('axios');

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|ig\.me).*)/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const rawUrl = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Interceptando enlace..." }, { quoted: msg });

        // Configuración base para evitar bloqueos por falta de cabeceras en NodeJS
        const axiosConfig = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000 // Cortar si el nodo tarda más de 10 segundos
        };

        try {
            // ==========================================
            // RUTA 1: TIKTOK (Motor TikWM - Intacto)
            // ==========================================
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
                    const videoUrl = data.hdplay || data.play; 
                    await sock.sendMessage(remitente, { video: { url: videoUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                }
                
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            } 
            
            // ==========================================
            // RUTA 2: INSTAGRAM (Cascada de Nodos Premium)
            // ==========================================
            else if (rawUrl.includes('instagram.com') || rawUrl.includes('ig.me')) {
                const cleanUrl = rawUrl.split('?')[0]; 
                const encodedUrl = encodeURIComponent(cleanUrl);
                let mediaList = [];

                // Cascada actualizada con nodos operativos al día de hoy
                const igApis = [
                    async () => (await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodedUrl}`, axiosConfig)).data?.result,
                    async () => (await axios.get(`https://bk9.fun/download/instagram?url=${encodedUrl}`, axiosConfig)).data?.BK9,
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`, axiosConfig)).data?.data,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodedUrl}`, axiosConfig)).data?.data
                ];

                for (let i = 0; i < igApis.length; i++) {
                    try {
                        let result = await igApis[i]();
                        
                        // Normalizar la respuesta (puede ser un array o un solo objeto)
                        if (result && Array.isArray(result) && result.length > 0) {
                            mediaList = result;
                            break; 
                        } else if (result && result.url) {
                            mediaList = [result];
                            break;
                        }
                    } catch (e) {
                        console.log(`[INFO] Nodo IG ${i + 1} falló o está saturado.`);
                        continue; 
                    }
                }

                if (mediaList.length === 0) {
                    throw new Error("Todos los servidores de extracción están bloqueados temporalmente por Instagram.");
                }

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo Instagram...", edit: statusMsg.key });

                for (let item of mediaList) {
                    const dlUrl = item.url || item;
                    if (!dlUrl) continue;

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
