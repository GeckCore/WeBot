export default {
    name: 'yuki_uploader',
    match: (text) => /^\.upload$/i.test(text),
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        // 1. Detectar el archivo (en el mensaje actual o en el respondido)
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media) {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nResponde a una imagen, vídeo o audio con `.upload` para generar un enlace.' });
        }

        const apiKey = "geckcore";
        const apiUrl = `https://api.yuki-wabot.my.id/tools/upload?apikey=${apiKey}`;

        try {
            await sock.sendMessage(remitente, { text: '⏳ *GECKCORE // SUBIENDO:* Procesando archivo...' }, { quoted: msg });

            // 2. Descargar el media de los servidores de WhatsApp
            const stream = await downloadContentFromMessage(media.msg, media.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 3. Preparar el envío a la API de Yuki
            const bodyForm = new FormData();
            // Creamos un Blob a partir del buffer descargado
            const blob = new Blob([buffer], { type: media.msg.mimetype || 'application/octet-stream' });
            bodyForm.append('file', blob, `file.${media.type === 'image' ? 'jpg' : 'mp4'}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                body: bodyForm
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();

            // 4. Validar respuesta y enviar enlace
            if (data.status && data.result && data.result.url) {
                const info = `✅ *ARCHIVO SUBIDO EXITOSAMENTE*
                
🔗 *Enlace:* ${data.result.url}
📦 *Tamaño:* ${data.result.size || 'N/A'}
⏱️ *Expira:* Nunca (según API)

> *GECKCORE // CLOUD INTERFACE*`;
                
                await sock.sendMessage(remitente, { text: info }, { quoted: msg });
            } else {
                console.error("[YUKI UPLOAD DEBUG]:", data);
                await sock.sendMessage(remitente, { 
                    text: `❌ *ERROR DE API:* ${data.message || 'La API no devolvió un enlace válido.'}` 
                });
            }

        } catch (e) {
            console.error('[YUKI UPLOAD CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* Fallo en la conexión con el servidor de Yuki.' });
        }
    }
};
