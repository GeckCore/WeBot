// plugins/wallpaper.js
const { wallpaper } = require('@bochilteam/scraper');

module.exports = {
    name: 'wallpaper',
    match: (text) => /^(wallpaper2?)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        // Extraer la búsqueda del texto
        const match = textoLimpio.match(/^(wallpaper2?)\s+(.+)$/i);
        const query = match[2].trim();

        try {
            // Buscamos fondos de pantalla
            const res = await wallpaper(query);
            
            if (!res || res.length === 0) {
                return sock.sendMessage(remitente, { text: `❌ No encontré fondos de pantalla para: *${query}*` });
            }

            // Seleccionamos uno al azar de los resultados
            const img = res[Math.floor(Math.random() * res.length)];

            await sock.sendMessage(remitente, { 
                image: { url: img }, 
                caption: `✨ Aquí tienes un fondo de: *${query}*` 
            }, { quoted: msg });

        } catch (error) {
            console.error("Error en wallpaper:", error);
            await sock.sendMessage(remitente, { text: "❌ Hubo un error al buscar el fondo de pantalla." });
        }
    }
};
