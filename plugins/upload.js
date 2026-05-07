export default {
    name: 'yuki_uploader_v2',
    match: (text) => /^\.upload$/i.test(text),
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media) {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nResponde a un archivo con `.upload`.' });
        }

        const apiKey = "geckcore";
        const apiUrl = `https://api.yuki-wabot.my.id/tools/upload?apikey=${apiKey}`;

        try {
            await sock.sendMessage(remitente, { text: '⏳ *GECKCORE // CLOUD:* Subiendo archivo...' }, { quoted: msg });

            const stream = await downloadContentFromMessage(media.msg, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            const bodyForm = new FormData();
            const blob = new Blob([buffer], { type: media.msg.mimetype || 'application/octet-stream' });
            bodyForm.append('file', blob, `file.${media.type === 'image' ? 'jpg' : 'mp4'}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                body: bodyForm
            });

            const data = await response.json();

            // --- CORRECCIÓN AQUÍ: Acceso directo a data.url ---
            if (data.status === true && data.url) {
                const info = `✅ *ARCHIVO ALOJADO EXITOSAMENTE*
                
🔗 *Enlace:* ${data.url}
🛰️ *Servidor:* ${data.server || 'Catbox'}
👤 *Creador:* ${data.creator || 'GECKCORE'}

> *GECKCORE // DATA INTERFACE*`;
                
                await sock.sendMessage(remitente, { text: info }, { quoted: msg });
            } else {
                console.error("[YUKI UPLOAD DEBUG]:", data);
                await sock.sendMessage(remitente, { 
                    text: `❌ *ERROR DE ESTRUCTURA:* La API cambió el formato de respuesta.` 
                });
            }

        } catch (e) {
            console.error('[YUKI UPLOAD CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* Fallo de conexión.' });
        }
    }
};
