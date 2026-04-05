// plugins/downloads.js
const axios = require('axios');

module.exports = {
    name: 'downloads',
    // Solo reacciona a enlaces de TikTok e Instagram
    match: (text) => /^(https?:\/\/(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|ig\.me).*)/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        // Extraemos la URL cruda sin importar lo que haya escrito el usuario alrededor
        const rawUrl = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Interceptando enlace..." }, { quoted: msg });

        try {
            // ==========================================
            // RUTA 1: TIKTOK (Motor TikWM - Ultra Estable)
            // ==========================================
            if (rawUrl.includes('tiktok.com')) {
                // Hacemos la petición a la API de TikWM
                const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(rawUrl)}&hd=1`);
                const data = res.data?.data;

                if (!data) throw new Error("El video es privado o fue eliminado.");

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo TikTok...", edit: statusMsg.key });

                // 1. Si es un carrusel de imágenes (Fotos)
                if (data.images && data.images.length > 0) {
                    for (let img of data.images) {
                        await sock.sendMessage(remitente, { image: { url: img } });
                    }
                } 
                // 2. Si es un video normal
                else if (data.play) {
                    const videoUrl = data.hdplay || data.play; // Prioriza HD si está disponible
                    await sock.sendMessage(remitente, { video: { url: videoUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                }
                
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            } 
            
            // ==========================================
            // RUTA 2: INSTAGRAM (Cascada de Nodos)
            // ==========================================
            else if (rawUrl.includes('instagram.com') || rawUrl.includes('ig.me')) {
                let mediaList = [];
                const encodedUrl = encodeURIComponent(rawUrl);

                // Nodos de extracción. Si falla uno, prueba el siguiente automáticamente.
                const igApis = [
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodedUrl}`)).data?.data,
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodedUrl}`)).data?.data,
                    async () => (await axios.get(`https://api.vreden.web.id/api/igdl?url=${encodedUrl}`)).data?.result
                ];

                for (const fetchApi of igApis) {
                    try {
                        const result = await fetchApi();
                        // Instagram suele devolver arrays porque pueden ser Reels, Fotos o Carruseles
                        if (result && Array.isArray(result) && result.length > 0 && result[0].url) {
                            mediaList = result;
                            break; 
                        } else if (result && result.url) {
                            mediaList = [result];
                            break;
                        }
                    } catch (e) {
                        continue; // Falla silenciosa, salta al siguiente nodo
                    }
                }

                if (mediaList.length === 0) {
                    throw new Error("El perfil es privado, requiere inicio de sesión o los nodos están saturados.");
                }

                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo Instagram...", edit: statusMsg.key });

                for (let item of mediaList) {
                    const dlUrl = item.url || item;
                    if (!dlUrl) continue;

                    // Detectar si el archivo final es video o imagen
                    if (dlUrl.includes('.mp4') || dlUrl.includes('video')) {
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
