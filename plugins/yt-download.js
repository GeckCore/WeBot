const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'youtube_dl',
    match: (text) => /^(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+)/i.test(text) 
                    && !text.includes('instagram.com') 
                    && !text.includes('tiktok.com'),

    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const url = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1].split('?si=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "🚀 Saltando bloqueos de YouTube..." }, { quoted: msg });

        const outName = `yt_${Date.now()}.mp4`;

        try {
            // 1. Petición a la API de Cobalt (Instancia pública o propia)
            const response = await axios.post('https://api.cobalt.tools/api/json', {
                url: url,
                videoQuality: '720', // Calidad máxima para WhatsApp
                downloadMode: 'video',
                filenameStyle: 'basic'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.status === 'error') {
                throw new Error(response.data.text);
            }

            // 2. Descargar el buffer del video desde el enlace que nos da Cobalt
            const videoUrl = response.data.url;
            const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(videoRes.data);

            const fileSizeMB = buffer.length / (1024 * 1024);

            if (fileSizeMB > 60) {
                throw new Error(`Video demasiado pesado (${fileSizeMB.toFixed(2)}MB).`);
            }

            // 3. Enviar directamente el buffer sin guardar en disco (más rápido)
            await sock.sendMessage(remitente, { 
                video: buffer, 
                caption: `✅ *YouTube Clean-View*\n📦 *Peso:* ${fileSizeMB.toFixed(2)} MB\n\n_Bypass exitoso vía Cobalt API._`,
                mimetype: 'video/mp4'
            }, { quoted: msg });

        } catch (err) {
            console.error("Error API YouTube:", err.message);
            await sock.sendMessage(remitente, { 
                text: `❌ *Fallo Crítico:* No se pudo obtener el video.\nMotivo: ${err.message}` 
            });
        } finally {
            // Borramos el mensaje de estado
            await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
