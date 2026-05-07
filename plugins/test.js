export default {
    name: 'quote_sticker_v2',
    match: (text) => /^\.(qc|quote)(?:\s+(.*))?$/i.test(text),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        // 1. Extraer el texto
        let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s+/i, '').trim();
        if (!textToQuote && quoted) {
            textToQuote = quoted.conversation || quoted.extendedTextMessage?.text || "";
        }

        if (!textToQuote) {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nEscribe algo o responde a un mensaje.' });
        }

        // 2. Identificar al autor (JID y Nombre)
        const targetJid = quoted ? (msg.message.extendedTextMessage.contextInfo.participant || msg.message.extendedTextMessage.contextInfo.remoteJid) : remitente;
        const pushName = quoted ? (msg.pushName || "Usuario") : msg.pushName;

        const apiKey = process.env.YUKI_API_KEY;

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // 3. Obtener URL del Avatar
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            // 4. Construcción de la URL de la API (Usando método URL para evitar fallos de subida)
            // IMPORTANTE: encodeURIComponent para que los símbolos del texto no rompan la URL
            const apiUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?method=URL&url=${encodeURIComponent(ppUrl)}&username=${encodeURIComponent(pushName)}&text=${encodeURIComponent(textToQuote)}&color=${encodeURIComponent('#1b1429')}&apikey=${apiKey}`;

            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                const errText = await response.text();
                console.error("[QUOTE API ERROR]:", errText);
                throw new Error("La API rechazó la petición.");
            }

            const data = await response.json();

            // 5. Envío del Sticker
            // Basándonos en tus pruebas anteriores, Yuki suele devolver el enlace en data.result o data.url
            const stickerUrl = data.result || data.url;

            if (stickerUrl) {
                await sock.sendMessage(remitente, { 
                    sticker: { url: stickerUrl },
                    mimetype: 'image/webp'
                }, { quoted: msg });
            } else {
                console.error("[QUOTE DEBUG]:", data);
                throw new Error("No se recibió URL del sticker.");
            }

        } catch (e) {
            console.error('[QUOTE STICKER CRITICAL]:', e.message);
            await sock.sendMessage(remitente, { text: '❌ *ERROR:* El servidor de stickers no responde o el texto es inválido.' });
        }
    }
};
