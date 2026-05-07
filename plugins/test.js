export default {
    name: 'quote_sticker_v5',
    match: (text) => text.toLowerCase().startsWith('.qc') || text.toLowerCase().startsWith('.quote'),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        try {
            // 1. Limpieza de texto
            let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s*/i, '').trim();
            if (!textToQuote && quoted) {
                textToQuote = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || "";
            }

            if (!textToQuote) return; 

            await sock.sendPresenceUpdate('composing', remitente);

            // 2. Obtención de datos (Evitamos el nombre "." que da problemas)
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const targetJid = quoted ? (contextInfo?.participant || contextInfo?.remoteJid) : remitente;
            
            let name = (quoted ? "Usuario" : msg.pushName) || "GECKCORE";
            if (name === "." || name.length < 2) name = "GECKCORE User"; // Fail-safe para el nombre

            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            // 3. Construcción de URL
            const apiKey = process.env.YUKI_API_KEY;
            const params = new URLSearchParams({
                method: 'URL',
                avatar: ppUrl,
                username: name,
                text: textToQuote,
                color: '#000000',
                key: apiKey
            });

            const finalUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?${params.toString()}`;

            // 4. Petición y manejo de respuesta
            const response = await fetch(finalUrl);
            
            // Si la API devuelve un error de red
            if (!response.ok) {
                console.error(`[QC ERROR] HTTP ${response.status}`);
                return;
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                // Yuki a veces devuelve .result, otras .url, otras .result.url
                const stickerUrl = data.result?.url || data.result || data.url;

                if (stickerUrl) {
                    await sock.sendMessage(remitente, { 
                        sticker: { url: stickerUrl },
                        mimetype: 'image/webp'
                    }, { quoted: msg });
                } else {
                    // Si llegamos aquí, la API respondió pero no hay link. Logeamos la respuesta entera.
                    console.log("[QC DEBUG] Respuesta JSON inesperada:", JSON.stringify(data));
                }
            } else {
                // Si la API devuelve el archivo PNG/WebP directamente (binario)
                const buffer = await response.arrayBuffer();
                await sock.sendMessage(remitente, { 
                    sticker: Buffer.from(buffer),
                    mimetype: 'image/webp'
                }, { quoted: msg });
            }

        } catch (e) {
            console.error('[QC CRITICAL ERROR]:', e.stack);
        }
    }
};
