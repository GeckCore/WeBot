const axios = require('axios');

module.exports = {
    name: 'screenshot',
    match: (text) => /^view\s+https?:\/\/[^\s]+$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const urlCaptura = textoLimpio.split(/\s+/)[1];
        let statusMsg = await sock.sendMessage(remitente, { text: `📸 *Iniciando captura multi-motor...*\n🔗 ${urlCaptura}` }, { quoted: msg });

        // Función para intentar con Google PageSpeed
        const motorGoogle = async (url) => {
            const res = await axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&screenshot=true`, { timeout: 20000 });
            const data = res.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
            return data ? Buffer.from(data.split(',')[1], 'base64') : null;
        };

        // Función para intentar con WordPress mShots (Sin API Key)
        const motorWordPress = async (url) => {
            const res = await axios.get(`https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1280&h=720`, { responseType: 'arraybuffer', timeout: 15000 });
            // WordPress a veces devuelve una imagen por defecto si está cargando, pero es mejor que nada
            return res.data;
        };

        // Función para intentar con la API de Microlink (Muy estable)
        const motorMicrolink = async (url) => {
            const res = await axios.get(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`, { responseType: 'arraybuffer', timeout: 15000 });
            return res.data;
        };

        try {
            let buffer;
            console.log("[INFO] Intentando Motor 1 (Google)...");
            try {
                buffer = await motorGoogle(urlCaptura);
            } catch (e) {
                console.log("[WARN] Google falló (429 o Timeout). Saltando a Motor 2...");
                try {
                    buffer = await motorMicrolink(urlCaptura);
                } catch (e2) {
                    console.log("[WARN] Microlink falló. Saltando a Motor 3 (Final)...");
                    buffer = await motorWordPress(urlCaptura);
                }
            }

            if (buffer) {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: `✅ *Captura exitosa*\n🌐 ${urlCaptura}` 
                }, { quoted: msg });
                await sock.sendMessage(remitente, { delete: statusMsg.key });
            } else {
                throw new Error("No se pudo obtener imagen de ningún motor.");
            }

        } catch (err) {
            await sock.sendMessage(remitente, { 
                text: `❌ *Error Crítico:* Todos los motores de renderizado están saturados o la web bloquea el acceso.`, 
                edit: statusMsg.key 
            });
        }
    }
};
