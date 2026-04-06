const axios = require('axios');

module.exports = {
    name: 'youtube_dl',
    match: (text) => /^(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/[^\s]+)/i.test(text) 
                    && !text.includes('instagram.com') 
                    && !text.includes('tiktok.com'),

    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const url = textoLimpio.match(/(https?:\/\/[^\s]+)/i)[1].split('?si=')[0];
        console.log(`[DEBUG] Intentando descarga vía API Cobalt para: ${url}`);
        
        let statusMsg = await sock.sendMessage(remitente, { text: "🚀 Bypass de seguridad activo... Extrayendo video." }, { quoted: msg });

        try {
            // Usamos una instancia de Cobalt que actúa como túnel
            const response = await axios.post('https://api.cobalt.tools/api/json', {
                url: url,
                videoQuality: '720',
                downloadMode: 'video',
                filenameStyle: 'basic'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            if (response.data.status === 'error' || response.data.status === 'rate-limit') {
                throw new Error(`Servidor saturado o error de API: ${response.data.text || 'Rate limit'}`);
            }

            const videoUrl = response.data.url;
            
            // Descargamos el video en memoria (Buffer) para no depender de permisos de escritura/lectura en disco
            const videoRes = await axios.get(videoUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000 // 30 segundos de margen
            });
            
            const buffer = Buffer.from(videoRes.data);
            const fileSizeMB = buffer.length / (1024 * 1024);

            if (fileSizeMB > 60) {
                throw new Error(`El video pesa ${fileSizeMB.toFixed(2)}MB y supera el límite de WhatsApp.`);
            }

            await sock.sendMessage(remitente, { 
                video: buffer, 
                caption: `✅ *YouTube Clean-View*\n📦 *Peso:* ${fileSizeMB.toFixed(2)} MB\n\n_Extraído exitosamente._`,
                mimetype: 'video/mp4'
            }, { quoted: msg });

        } catch (err) {
            console.error("Error en módulo YouTube:", err.message);
            let mensajeError = "❌ No se pudo procesar el video.";
            
            if (err.message.includes("403") || err.message.includes("bot")) {
                mensajeError = "❌ YouTube ha bloqueado incluso la API externa. La IP de tu servidor está marcada. Inténtalo de nuevo en unos minutos.";
            } else if (err.message.includes("limite")) {
                mensajeError = `❌ ${err.message}`;
            }

            await sock.sendMessage(remitente, { text: mensajeError });
        } finally {
            if (statusMsg) await sock.sendMessage(remitente, { delete: statusMsg.key });
        }
    }
};
