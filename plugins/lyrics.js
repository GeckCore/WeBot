// plugins/lyrics.js
const axios = require('axios');

module.exports = {
    name: 'lyrics',
    match: (text) => /^(letra|lyrics|lyric|lirik)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const query = textoLimpio.match(/^(letra|lyrics|lyric|lirik)\s+(.+)$/i)[2].trim();
        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando letra de: *${query}*...` });

        try {
            // 1. Extraer letra desde LRCLIB (Base de datos Open Source, sin bloqueos de IP)
            const lrclibRes = await axios.get(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
            
            // Filtramos el primer resultado que realmente contenga letra
            const songData = lrclibRes.data.find(t => t.plainLyrics);

            if (!songData) {
                return sock.sendMessage(remitente, { text: "❌ No encontré la letra en la base de datos.", edit: statusMsg.key });
            }

            const title = songData.trackName;
            const artist = songData.artistName;
            const lyrics = songData.plainLyrics;

            // 2. Extraer Portada y Audio Preview desde la API oficial de iTunes (A prueba de balas)
            let image = "https://i.imgur.com/vHmtx2a.jpeg"; // Fondo por defecto
            let previewUrl = null;

            try {
                const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`);
                const itunesTrack = itunesRes.data.results[0];
                
                if (itunesTrack) {
                    // iTunes da portadas de 100x100, modificamos la URL para forzar 600x600 (alta resolución)
                    image = itunesTrack.artworkUrl100.replace('100x100bb', '600x600bb');
                    previewUrl = itunesTrack.previewUrl;
                }
            } catch (e) {
                console.log("[INFO] iTunes API no respondió, se usará la imagen por defecto.");
            }

            const textoFinal = `🎵 *TÍTULO:* ${title}\n` +
                               `👤 *ARTISTA:* ${artist}\n\n` +
                               `📜 *LETRA:*\n\n${lyrics}`;

            // 3. Enviar Imagen + Letra
            await sock.sendMessage(remitente, { 
                image: { url: image }, 
                caption: textoFinal 
            }, { quoted: msg });

            // 4. Enviar Audio de Muestra (Si iTunes lo proporcionó)
            if (previewUrl) {
                await sock.sendMessage(remitente, { 
                    audio: { url: previewUrl }, 
                    mimetype: 'audio/mp4',
                    fileName: `${title}.mp3`
                }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error("Error en Lyrics:", error.message);
            await sock.sendMessage(remitente, { text: `❌ Error de red interno: ${error.message}`, edit: statusMsg.key });
        }
    }
};
