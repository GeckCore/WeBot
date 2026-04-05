// plugins/lyrics.js
const axios = require('axios');

module.exports = {
    name: 'lyrics',
    match: (text) => /^(letra|lyrics|lyric|lirik)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const query = textoLimpio.match(/^(letra|lyrics|lyric|lirik)\s+(.+)$/i)[2].trim();
        let statusMsg = await sock.sendMessage(remitente, { text: `🔍 Buscando letra de: *${query}*...` });

        try {
            // 1. Buscamos la canción en Genius a través de la API de Delirius
            const searchRes = await axios.get(`https://deliriussapi-oficial.vercel.app/search/genius?q=${encodeURIComponent(query)}`);
            const songData = searchRes.data[0];

            if (!songData) {
                return sock.sendMessage(remitente, { text: "❌ No encontré resultados para esa canción.", edit: statusMsg.key });
            }

            // 2. Extraemos la letra usando la URL obtenida
            const lyricsRes = await axios.get(`https://deliriussapi-oficial.vercel.app/search/lyrics?url=${encodeURIComponent(songData.url)}&parse=false`);
            const lyrics = lyricsRes.data.lyrics || "Letra no disponible.";

            // 3. Intentamos obtener un audio preview (usando una API alternativa para no depender de librerías pesadas)
            let previewUrl = "";
            try {
                const someRandomRes = await axios.get(`https://some-random-api.com/lyrics?title=${encodeURIComponent(songData.title)}`);
                previewUrl = someRandomRes.data?.thumbnail?.genius || songData.image;
            } catch (e) {
                previewUrl = songData.image;
            }

            const textoFinal = `🎵 *TITULO:* ${songData.title}\n` +
                               `👤 *ARTISTA:* ${songData.artist.name}\n\n` +
                               `📜 *LETRA:*\n\n${lyrics}`;

            // 4. Enviamos imagen con la letra
            await sock.sendMessage(remitente, { 
                image: { url: songData.image }, 
                caption: textoFinal 
            }, { quoted: msg });

            // 5. Intentamos enviar el audio preview de Deezer si está disponible (basado en tu lógica)
            // Nota: La API de some-random-api a veces da el link de preview directamente.
            try {
                const deezerRes = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(songData.title + ' ' + songData.artist.name)}`);
                const track = deezerRes.data.data[0];
                if (track && track.preview) {
                    await sock.sendMessage(remitente, { 
                        audio: { url: track.preview }, 
                        mimetype: 'audio/mp4',
                        fileName: `${songData.title}.mp3`
                    }, { quoted: msg });
                }
            } catch (errAudio) {
                console.log("No se pudo enviar el audio preview.");
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error(error);
            await sock.sendMessage(remitente, { text: `❌ Error: No se pudo obtener la letra.`, edit: statusMsg.key });
        }
    }
};
