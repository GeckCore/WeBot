const axios = require('axios');

module.exports = {
    name: 'screenshot',
    // Match: view https://google.com
    match: (text) => /^view\s+https?:\/\/[^\s]+$/i.test(text),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        // Extraer la URL del mensaje
        const urlCaptura = textoLimpio.split(/\s+/)[1];
        
        let statusMsg = await sock.sendMessage(remitente, { 
            text: `📸 *Capturando pantalla...*\n🔗 ${urlCaptura}\n\n_Esto puede tardar unos segundos dependiendo de la web._` 
        }, { quoted: msg });

        try {
            // Usamos la API de Thum.io o Screenshotmachine (opciones gratuitas sin registro)
            // Thum.io es muy rápida para capturas estándar.
            const apiUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(urlCaptura)}?w=1280&h=720`;

            // Enviamos la imagen directamente usando la URL de la API
            await sock.sendMessage(remitente, { 
                image: { url: apiUrl }, 
                caption: `✅ *Captura finalizada*\n🌐 *Web:* ${urlCaptura}` 
            }, { quoted: msg });

            // Borrar el mensaje de "procesando"
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error en Captura:", err.message);
            await sock.sendMessage(remitente, { 
                text: `❌ *Error al capturar la web.*\n\nMotivo: La web es demasiado pesada o bloquea las capturas automáticas.`, 
                edit: statusMsg.key 
            });
        }
    }
};
