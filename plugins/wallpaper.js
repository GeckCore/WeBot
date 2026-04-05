// plugins/wallpaper.js
const axios = require('axios');

module.exports = {
    name: 'wallpaper',
    match: (text) => /^(wallpaper2?)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const match = textoLimpio.match(/^(wallpaper2?)\s+(.+)$/i);
        const query = match[2].trim();

        try {
            // Usamos Lexica Art API (Fondos de alta calidad, muy difícil de bloquear)
            const res = await axios.get(`https://lexica.art/api/v1/search?q=${encodeURIComponent(query)}`);
            const images = res.data?.images;

            if (!images || images.length === 0) {
                return sock.sendMessage(remitente, { text: `❌ No encontré resultados para: *${query}*` });
            }

            // Filtramos por imágenes que tengan un tamaño decente para fondo
            // Seleccionamos una al azar de las primeras 20 para que sea rápido
            const randomIndex = Math.floor(Math.random() * Math.min(images.length, 20));
            const imgUrl = images[randomIndex].src;

            await sock.sendMessage(remitente, { 
                image: { url: imgUrl }, 
                caption: `✨ Wallpaper: *${query}*\n🔍 Nodo: Lexica Art` 
            }, { quoted: msg });

        } catch (error) {
            console.error("Error en wallpaper:", error.message);
            
            // Fallback: Si Lexica falla, intentamos una búsqueda rápida en Unsplash
            try {
                const fallback = `https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1000`; // Imagen genérica si todo muere
                await sock.sendMessage(remitente, { image: { url: fallback }, caption: "❌ Error de conexión. Te dejo un fondo aleatorio." });
            } catch (e) {
                await sock.sendMessage(remitente, { text: "❌ Error crítico: Los servidores de imágenes están bloqueando la VPS." });
            }
        }
    }
};
