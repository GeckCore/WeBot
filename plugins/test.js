import fs from 'fs';
import { Buffer } from 'buffer';

export default {
    name: 'upscale_ai_v2',
    match: (text) => /^\.upscale\s?(\d)?$/i.test(text),
    
    // 🔴 Añadido 'textoLimpio' aquí abajo para que no de ReferenceError
    execute: async ({ sock, remitente, msg, textoLimpio, quoted, getMediaInfo, downloadContentFromMessage }) => {
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media || media.type !== 'image') {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nResponde a una imagen para procesar el reescalado.' });
        }

        // Ahora textoLimpio ya existe y no dará error
        const matches = textoLimpio.match(/\d/);
        const scale = matches ? matches[0] : "2";
        const apiKey = "sylphy-qHHxzmP";

        try {
            await sock.sendMessage(remitente, { text: `⏳ *INICIANDO:* Reescalado AI x${scale}...` }, { quoted: msg });

            // 1. Descarga del buffer de WhatsApp
            const stream = await downloadContentFromMessage(media.msg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

            // 2. Subida a Catbox (Uploader temporal)
            const bodyForm = new FormData();
            bodyForm.append('reqtype', 'fileupload');
            // Usamos Blob para que sea compatible con el entorno del contenedor
            bodyForm.append('fileToUpload', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');

            const uploadRes = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: bodyForm
            });
            
            const imageUrl = await uploadRes.text();
            
            if (!imageUrl.startsWith('https://')) {
                console.error("[UPLOADER DEBUG]:", imageUrl);
                throw new Error("Respuesta del servidor de archivos no válida.");
            }

            // 3. Petición a la API de Sylphy
            const apiUrl = `https://sylphyy.xyz/tools/upscale?url=${encodeURIComponent(imageUrl.trim())}&scale=${scale}&api_key=${apiKey}`;
            
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.status !== true || !data.result) {
                return sock.sendMessage(remitente, { text: `❌ *API Error:* ${data.message || 'Error en el motor AI'}` });
            }

            // 4. Envío de vuelta al chat
            await sock.sendMessage(remitente, { 
                image: { url: data.result }, 
                caption: `✅ *GECKCORE // PROCESO FINALIZADO*\n*Escala:* x${scale}\n*Status:* Paid API Tier` 
            }, { quoted: msg });

        } catch (e) {
            console.error('[UPSCALER CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR CRÍTICO:* Fallo en la subida o saturación de API.' });
        }
    }
};
