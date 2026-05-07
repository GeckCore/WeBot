import fs from 'fs';
import { Buffer } from 'buffer';

export default {
    name: 'upscale_tester',
    match: (text) => /^\.upscales\s?(\d)?$/i.test(text),
    
    execute: async ({ sock, remitente, msg, msgType, quoted, getMediaInfo, downloadContentFromMessage }) => {
        // 1. Identificar si hay una imagen (directa o respondida)
        const targetMsg = quoted ? quoted : msg.message;
        const media = getMediaInfo(targetMsg);

        if (!media || media.type !== 'image') {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nResponde a una imagen para reescalarla.' });
        }

        const args = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const scale = args.match(/\d/) ? args.match(/\d/)[0] : "2"; // Por defecto escala 2
        const apiKey = "sylphy-qHHxzmP";

        try {
            await sock.sendMessage(remitente, { text: `⏳ *Procesando Reescalado (x${scale})...*` }, { quoted: msg });

            // 2. Descargar la imagen de los servidores de WhatsApp
            const stream = await downloadContentFromMessage(media.msg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 3. Subir a un host temporal (Telegra.ph) para obtener una URL pública
            // Este paso es necesario porque la API de Sylphy pide una URL
            const formData = new FormData();
            formData.append('file', new Blob([buffer]), 'image.jpg');

            const uploadRes = await fetch('https://telegra.ph/upload', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadRes.json();
            
            if (!uploadData[0]?.src) throw new Error("Fallo al generar URL temporal.");
            const imageUrl = `https://telegra.ph${uploadData[0].src}`;

            // 4. Llamada a tu API pagada
            const apiUrl = `https://sylphyy.xyz/tools/upscale?url=${encodeURIComponent(imageUrl)}&scale=${scale}&api_key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            const data = await response.json();

            if (data.status !== true || !data.result) {
                console.error("[UPSCALER ERROR]:", data);
                return sock.sendMessage(remitente, { text: `❌ *Error de API:* ${data.message || 'Sin respuesta.'}` });
            }

            // 5. Enviar la imagen reescalada de vuelta
            await sock.sendMessage(remitente, { 
                image: { url: data.result }, 
                caption: `✅ *UPSCALED x${scale}*\n> Engine: Sylphy AI\n> Status: Paid Tier` 
            }, { quoted: msg });

        } catch (e) {
            console.error('[UPSCALER CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *Error crítico al procesar la imagen.*' });
        }
    }
};
