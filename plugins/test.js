import fs from 'fs';
import { Buffer } from 'buffer';

export default {
    name: 'upscale_ai',
    match: (text) => /^\.upscale\s?(\d)?$/i.test(text),
    
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media || media.type !== 'image') {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nResponde a una imagen para usar el reescalado AI.' });
        }

        // Obtener escala (2, 4, 8...) o defecto 2
        const matches = msg.message?.conversation?.match(/\d/) || msg.message?.extendedTextMessage?.text?.match(/\d/);
        const scale = matches ? matches[0] : "2";
        const apiKey = "sylphy-qHHxzmP";

        try {
            await sock.sendMessage(remitente, { text: `⏳ *PROCESANDO:* Reescalado AI x${scale} en marcha...` }, { quoted: msg });

            // 1. Descarga del buffer
            const stream = await downloadContentFromMessage(media.msg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            // 2. Subida a uploader alternativo (Catbox es más estable para APIs)
            const bodyForm = new FormData();
            bodyForm.append('reqtype', 'fileupload');
            bodyForm.append('fileToUpload', new Blob([buffer]), 'image.jpg');

            const uploadRes = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: bodyForm
            });
            
            const imageUrl = await uploadRes.text();
            if (!imageUrl.startsWith('https')) throw new Error("Fallo en uploader temporal");

            // 3. Llamada a la API pagada de Sylphy
            const apiUrl = `https://sylphyy.xyz/tools/upscale?url=${encodeURIComponent(imageUrl)}&scale=${scale}&api_key=${apiKey}`;
            
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.status !== true || !data.result) {
                return sock.sendMessage(remitente, { text: `❌ *API Error:* ${data.message || 'Error desconocido'}` });
            }

            // 4. Envío del resultado
            await sock.sendMessage(remitente, { 
                image: { url: data.result }, 
                caption: `✅ *GECKCORE // UPSCALE COMPLETE*\n*Escala:* x${scale}\n*Engine:* Sylphy Paid Tier` 
            }, { quoted: msg });

        } catch (e) {
            console.error('[UPSCALER CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* El servidor temporal o la API no responden.' });
        }
    }
};
