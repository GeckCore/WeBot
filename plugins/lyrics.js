// plugins/lyrics.js
const axios = require('axios');

module.exports = {
    name: 'lyrics',
    match: (text) => /^(letra|lyrics|lyric|lirik)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const query = textoLimpio.match(/^(letra|lyrics|lyric|lirik)\s+(.+)$/i)[2].trim();
        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando letra de: *${query}*...` });

        try {
            let title, artist, lyrics, image;

            // 1. Intento principal: API de Popcat
            try {
                const res = await axios.get(`https://api.popcat.xyz/lyrics?song=${encodeURIComponent(query)}`);
                if (!res.data.lyrics) throw new Error("Sin letra en Popcat");
                
                title = res.data.title;
                artist = res.data.artist;
                lyrics = res.data.lyrics;
                image = res.data.image;
            } catch (e) {
                // 2. Fallback: Some-Random-API
                const resFallback = await axios.get(`https://some-random-api.com/lyrics?title=${encodeURIComponent(query)}`);
                if (!resFallback.data.lyrics) throw new Error("Sin letra en Fallback");

                title = resFallback.data.title;
                artist = resFallback.data.author;
                lyrics = resFallback.data.lyrics;
                image = resFallback.data.thumbnail?.genius;
            }

            const textoFinal = `🎵 *TITULO:* ${title}\n` +
                               `👤 *ARTISTA:* ${artist}\n\n` +
                               `📜 *LETRA:*\n\n${lyrics}`;

            // 3. Enviar Imagen con la Letra
            const imagenSegura = image || "https://i.imgur.com/vHmtx2a.jpeg"; // Fondo genérico si no hay portada
            await sock.sendMessage(remitente, { 
                image: { url: imagenSegura }, 
                caption: textoFinal 
            }, { quoted: msg });

            // 4. Intentar enviar el audio preview de Deezer
            try {
                const deezerRes = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(title + ' ' + artist)}`);
                const track = deezerRes.data.data[0];
                
                if (track && track.preview) {
                    await sock.sendMessage(remitente, { 
                        audio: { url: track.preview }, 
                        mimetype: 'audio/mp4',
                        fileName: `${title}.mp3`
                    }, { quoted: msg });
                }
            } catch (errAudio) {
                console.log("[INFO] Audio preview no encontrado en Deezer.");
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error("Error en Lyrics:", error.message);
            await sock.sendMessage(remitente, { text: `❌ Error: No se encontró la letra para "${query}".`, edit: statusMsg.key });
        }
    }
};
