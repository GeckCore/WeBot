export default {
    name: 'music_detector_v2',
    match: (text) => /^\.(find|whatmusic)$/i.test(text),
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media || (media.type !== 'audio' && media.type !== 'video')) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ *GECKCORE // ERROR*\nResponde a un audio o vídeo para identificar la música.' 
            });
        }

        const apiKey = "geckcore";
        const uploadUrl = `https://api.yuki-wabot.my.id/tools/upload?apikey=${apiKey}`;
        const identifyUrl = `https://api.yuki-wabot.my.id/tools/whatmusic?apikey=${apiKey}&url=`;

        try {
            await sock.sendMessage(remitente, { text: '🔍 *GECKCORE // ESCUCHANDO:* Analizando audio...' }, { quoted: msg });

            const stream = await downloadContentFromMessage(media.msg, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            const bodyForm = new FormData();
            const blob = new Blob([buffer], { type: media.msg.mimetype || 'application/octet-stream' });
            bodyForm.append('file', blob, `temp_audio.${media.type === 'audio' ? 'mp3' : 'mp4'}`);

            const uploadRes = await fetch(uploadUrl, { method: 'POST', body: bodyForm });
            const uploadData = await uploadRes.json();

            if (!uploadData.status || !uploadData.url) throw new Error("Fallo en subida temporal.");

            const fileUrl = uploadData.url;
            const response = await fetch(`${identifyUrl}${encodeURIComponent(fileUrl)}`);
            const responseData = await response.json();

            // --- REPARACIÓN DE MAPEO SEGÚN TU LOG ---
            if (responseData.status && responseData.data && responseData.data.length > 0) {
                const res = responseData.data[0]; // Cogemos el primer resultado de la lista
                
                // Procesamos los links si existen (vienen como Array)
                const links = Array.isArray(res.url) ? res.url.join('\n🔗 ') : 'No disponible';

                const info = `🎵 *MÚSICA DETECTADA*

• *Título:* ${res.title || 'Desconocido'}
• *Artista:* ${res.artist || 'Desconocido'}
• *Álbum:* ${res.album || 'N/A'}
• *Género:* ${res.genres || 'N/A'}
• *Duración:* ${res.duration || 'N/A'}
• *Lanzamiento:* ${res.release_date || 'N/A'}

🔗 *Links encontrados:*
🔗 ${links}

> *GECKCORE // AUDIO INTERFACE*`;

                await sock.sendMessage(remitente, { text: info }, { quoted: msg });
            } else {
                console.error("[WHATMUSIC DEBUG]:", responseData);
                await sock.sendMessage(remitente, { 
                    text: '❌ *SIN RESULTADOS:* No se ha encontrado ninguna coincidencia.' 
                });
            }

        } catch (e) {
            console.error('[WHATMUSIC CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* Fallo en el proceso de análisis.' });
        }
    }
};
