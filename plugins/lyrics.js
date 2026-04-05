// plugins/lyrics.js
const axios = require('axios');

module.exports = {
    name: 'lyrics',
    match: (text) => /^(letra|lyrics|lyric|lirik)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const query = textoLimpio.match(/^(letra|lyrics|lyric|lirik)\s+(.+)$/i)[2].trim();
        let statusMsg = await sock.sendMessage(remitente, { text: `🔎 Identificando canción: *${query}*...` });

        try {
            // 1. OBTENER METADATOS OFICIALES (iTunes) - Esto asegura que no se equivoque de canción
            const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`);
            const track = itunesRes.data.results[0];

            if (!track) {
                return sock.sendMessage(remitente, { text: "❌ No pude identificar esa canción. Intenta escribir el nombre y el artista.", edit: statusMsg.key });
            }

            const officialTitle = track.trackName;
            const officialArtist = track.artistName;
            const image = track.artworkUrl100.replace('100x100bb', '600x600bb');
            const previewUrl = track.previewUrl;

            await sock.sendMessage(remitente, { text: `✅ Encontrada: *${officialTitle}* de *${officialArtist}*\n⏳ Buscando letra...`, edit: statusMsg.key });

            let lyrics = null;

            // 2. BUSQUEDA EN NODO 1: LRCLIB (Rápida y segura para VPS)
            try {
                const lrclibRes = await axios.get(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(officialArtist)}&track_name=${encodeURIComponent(officialTitle)}`);
                lyrics = lrclibRes.data.plainLyrics;
            } catch (e) {
                console.log("[INFO] Nodo 1 falló, probando Nodo de Emergencia...");
            }

            // 3. BUSQUEDA EN NODO 2: SIPUTZX (Genius/Google Scraper) - Para canciones difíciles
            if (!lyrics) {
                try {
                    const siputzRes = await axios.get(`https://api.siputzx.my.id/api/s/genius?q=${encodeURIComponent(officialArtist + " " + officialTitle)}`);
                    // El nodo de búsqueda nos da una URL de Genius, ahora extraemos la letra
                    const geniusUrl = siputzRes.data.data[0]?.url;
                    if (geniusUrl) {
                        const lyricsRes = await axios.get(`https://api.siputzx.my.id/api/d/lyrics?url=${encodeURIComponent(geniusUrl)}`);
                        lyrics = lyricsRes.data.data?.lyrics;
                    }
                } catch (e) {
                    console.log("[INFO] Nodo 2 falló.");
                }
            }

            if (!lyrics || lyrics.length < 10) {
                return sock.sendMessage(remitente, { text: `❌ No se encontró la letra de *${officialTitle}* en ninguna base de datos pública.`, edit: statusMsg.key });
            }

            const textoFinal = `🎵 *TÍTULO:* ${officialTitle}\n` +
                               `👤 *ARTISTA:* ${officialArtist}\n\n` +
                               `📜 *LETRA:*\n\n${lyrics}`;

            // Enviar Portada + Letra
            await sock.sendMessage(remitente, { 
                image: { url: image }, 
                caption: textoFinal 
            }, { quoted: msg });

            // Enviar Audio Preview (iTunes siempre funciona)
            if (previewUrl) {
                await sock.sendMessage(remitente, { 
                    audio: { url: previewUrl }, 
                    mimetype: 'audio/mp4',
                    fileName: `${officialTitle}.mp3`
                }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error("Error en Lyrics:", error.message);
            await sock.sendMessage(remitente, { text: `❌ Error técnico: ${error.message}`, edit: statusMsg.key });
        }
    }
};
