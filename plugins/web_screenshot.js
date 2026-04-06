const axios = require('axios');

module.exports = {
    name: 'screenshot',
    match: (text) => /^view\s+https?:\/\/[^\s]+$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const urlCaptura = textoLimpio.split(/\s+/)[1];
        
        let statusMsg = await sock.sendMessage(remitente, { 
            text: `📸 *Capturando pantalla con renderizado completo...*\n🔗 ${urlCaptura}` 
        }, { quoted: msg });

        try {
            // Usamos un servicio que renderiza en la nube y evita el baneo de IP
            // Esta URL genera la captura directamente.
            const apiUrl = `https://api.screenshotmachine.com/?key=7d6786&url=${encodeURIComponent(urlCaptura)}&dimension=1280x720&delay=2000`;
            // Nota: "delay=2000" hace que espere 2 segundos a que cargue el JS de la web antes de la foto.

            // Intentamos validar que la imagen existe antes de enviarla
            const response = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 15000 });
            
            if (response.data) {
                await sock.sendMessage(remitente, { 
                    image: response.data, 
                    caption: `✅ *Vista previa de:* ${urlCaptura}` 
                }, { quoted: msg });
                
                await sock.sendMessage(remitente, { delete: statusMsg.key });
            } else {
                throw new Error("Imagen vacía");
            }

        } catch (err) {
            // Si falla la primera, usamos un mirror de emergencia (Google PageSpeed API)
            try {
                const googleApi = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(urlCaptura)}&screenshot=true`;
                const res = await axios.get(googleApi);
                const base64 = res.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
                
                if (base64) {
                    const buffer = Buffer.from(base64.split(',')[1], 'base64');
                    await sock.sendMessage(remitente, { image: buffer, caption: `✅ *Vista previa (Mirror Google):* ${urlCaptura}` }, { quoted: msg });
                    await sock.sendMessage(remitente, { delete: statusMsg.key });
                } else {
                    throw new Error("Fallo total");
                }
            } catch (e) {
                await sock.sendMessage(remitente, { 
                    text: `❌ *Error:* La web bloquea capturas externas o no existe.`, 
                    edit: statusMsg.key 
                });
            }
        }
    }
};
