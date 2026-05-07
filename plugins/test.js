export default {
    name: 'music_detector',
    match: (text) => /^\.(find|whatmusic)$/i.test(text),
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        // 1. Identificar el archivo (audio o vídeo)
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media || (media.type !== 'audio' && media.type !== 'video')) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ *GECKCORE // ERROR*\nResponde a un audio, nota de voz o vídeo para identificar la música.' 
            });
        }

        const apiKey = "geckcore";
        const uploadUrl = `https://api.yuki-wabot.my.id/tools/upload?apikey=${apiKey}`;
        const identifyUrl = `https://api.yuki-wabot.my.id/tools/whatmusic?apikey=${apiKey}&url=`;

        try {
            await sock.sendMessage(remitente, { text: '🔍 *GECKCORE // ESCUCHANDO:* Analizando frecuencias...' }, { quoted: msg });

            // 2. Descargar el archivo
            const stream = await downloadContentFromMessage(media.msg, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            // 3. Subida temporal para obtener URL (usando tu método exitoso)
            const bodyForm = new FormData();
            const blob = new Blob([buffer], { type: media.msg.mimetype || 'application/octet-stream' });
            bodyForm.append('file', blob, `temp_audio.${media.type === 'audio' ? 'mp3' : 'mp4'}`);

            const uploadRes = await fetch(uploadUrl, { method: 'POST', body: bodyForm });
            const uploadData = await uploadRes.json();

            if (!uploadData.status || !uploadData.url) {
                throw new Error("No se pudo generar el enlace temporal para el análisis.");
            }

            const fileUrl = uploadData.url;

            // 4. Identificación de la música
            const response = await fetch(`${identifyUrl}${encodeURIComponent(fileUrl)}`);
            const data = await response.json();

            // 5. Formatear y enviar resultados
            // Nota: El mapeo depende de la estructura exacta de la API de Yuki
            if (data.status && data.result) {
                const res = data.result;
                const info = `🎵 *MÚSICA DETECTADA*

• *Título:* ${res.title || 'Desconocido'}
• *Artista:* ${res.artist || 'Desconocido'}
• *Álbum:* ${res.album || 'N/A'}
• *Género:* ${res.genres || 'N/A'}
• *Lanzamiento:* ${res.release_date || 'N/A'}

🔗 *Link:* ${res.url || 'No disponible'}

> *GECKCORE // AUDIO INTERFACE*`;

                await sock.sendMessage(remitente, { text: info }, { quoted: msg });
            } else {
                console.error("[WHATMUSIC DEBUG]:", data);
                await sock.sendMessage(remitente, { 
                    text: '❌ *SIN RESULTADOS:* No he podido reconocer ninguna canción en este archivo.' 
                });
            }

        } catch (e) {
            console.error('[WHATMUSIC CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* Fallo en el motor de reconocimiento.' });
        }
    }
};
