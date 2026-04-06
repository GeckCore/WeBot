const axios = require('axios');

module.exports = {
    name: 'screenshot',
    // Match: view https://google.com
    match: (text) => /^view\s+https?:\/\/[^\s]+$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const urlCaptura = textoLimpio.split(/\s+/)[1];
        
        let statusMsg = await sock.sendMessage(remitente, { 
            text: `📸 *Renderizando vista previa vía Google...*\n🔗 ${urlCaptura}\n\n_Espere un momento, Google está analizando la web._` 
        }, { quoted: msg });

        try {
            // Usamos la API de Google PageSpeed Insights (No requiere KEY para uso moderado)
            // Esta API es la más estable del mundo para esto.
            const googleApi = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(urlCaptura)}&screenshot=true`;
            
            const response = await axios.get(googleApi, { timeout: 20000 });
            
            // Google devuelve la imagen en Base64 dentro de un JSON complejo
            const base64Data = response.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;

            if (base64Data) {
                // Convertir Base64 (que viene como data:image/jpeg;base64,...) a Buffer
                const buffer = Buffer.from(base64Data.split(',')[1], 'base64');

                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: `✅ *Captura de Google Insights*\n🌐 *Web:* ${urlCaptura}` 
                }, { quoted: msg });

                await sock.sendMessage(remitente, { delete: statusMsg.key });
            } else {
                throw new Error("Google no pudo generar la captura.");
            }

        } catch (err) {
            console.error("Error Screenshot Google:", err.message);
            await sock.sendMessage(remitente, { 
                text: `❌ *Error de Renderizado*\n\nLa web es privada, requiere login o Google no tiene acceso a ella.`, 
                edit: statusMsg.key 
            });
        }
    }
};
