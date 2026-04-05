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

        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando "${query}" en YouTube...` });

        try {
            const searchRes = await yts({ query, hl: 'es', gl: 'ES' });
            const video = searchRes.videos[0];

            if (!video) {
                return sock.sendMessage(remitente, { text: "❌ No encontré nada con ese nombre.", edit: statusMsg.key });
            }

            const infoTexto = `📌 *${video.title}*\n⏱️ *Duración:* ${video.timestamp}\n\n⏳ *Probando 7 nodos de descarga...*`;
            await sock.sendMessage(remitente, { 
                image: { url: video.thumbnail }, 
                caption: infoTexto,
                edit: statusMsg.key
            });

            const url = video.url;
            let finalUrl = null;

            // BATERÍA DE 7 NODOS DE EXTRACCIÓN (Ordenados por estabilidad actual)
            const apis = [
                // Nodo 1: Siputzx
                async () => {
                    const res = await axios.get(`https://api.siputzx.my.id/api/d/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.data?.dl || res.data?.data?.url;
                },
                // Nodo 2: Delirius (Muy potente)
                async () => {
                    const res = await axios.get(`https://deliriussapi-oficial.vercel.app/download/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.data?.download?.url || res.data?.data?.url;
                },
                // Nodo 3: Ryzendesu
                async () => {
                    const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.url || res.data?.download?.url;
                },
                // Nodo 4: BoxiBot (Privada/Estable)
                async () => {
                    const res = await axios.get(`https://api.boxi.bot/api/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.result?.url || res.data?.url;
                },
                // Nodo 5: Vreden
                async () => {
                    const res = await axios.get(`https://api.vreden.web.id/api/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.result?.download?.url || res.data?.result?.url;
                },
                // Nodo 6: Agatz
                async () => {
                    const res = await axios.get(`https://api.agatz.xyz/api/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.data?.downloadUrl || res.data?.data?.url;
                },
                // Nodo 7: Dhamz
                async () => {
                    const res = await axios.get(`https://api.dhamzxploit.my.id/api/ytmp${isVideo ? '4' : '3'}?url=${url}`);
                    return res.data?.result?.url;
                }
            ];

            // Ejecución en cascada
            for (let i = 0; i < apis.length; i++) {
                try {
                    console.log(`[DEBUG] Probando Nodo ${i + 1}...`);
                    const dlUrl = await apis[i]();
                    if (dlUrl && dlUrl.startsWith('http')) {
                        finalUrl = dlUrl;
                        break;
                    }
                } catch (e) {
                    console.log(`[DEBUG] Nodo ${i + 1} falló.`);
                    continue; 
                }
            }

            if (!finalUrl) {
                return sock.sendMessage(remitente, { 
                    text: `❌ *CAÍDA TOTAL:* Los 7 nodos de descarga han fallado simultáneamente. YouTube ha actualizado sus bloqueos hoy. Intenta de nuevo en un rato.`, 
                    edit: statusMsg.key 
                });
            }

            await sock.sendMessage(remitente, { text: "🚀 ¡Enlace encontrado! Enviando...", edit: statusMsg.key });

            // Enviar el archivo
            const messageConfig = isVideo 
                ? { video: { url: finalUrl }, mimetype: 'video/mp4', caption: `✅ ${video.title}` }
                : { audio: { url: finalUrl }, mimetype: 'audio/mpeg' };

            await sock.sendMessage(remitente, messageConfig, { quoted: msg });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(remitente, { text: `❌ Error inesperado: ${error.message}`, edit: statusMsg.key });
        }
    }
};
