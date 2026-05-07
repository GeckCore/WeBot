export default {
    name: 'quote_sticker_v4',
    // Disparador más flexible
    match: (text) => text.toLowerCase().startsWith('.qc') || text.toLowerCase().startsWith('.quote'),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        try {
            // 1. Extraer el texto
            let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s*/i, '').trim();
            
            if (!textToQuote && quoted) {
                textToQuote = quoted.conversation || 
                              quoted.extendedTextMessage?.text || 
                              quoted.imageMessage?.caption || "";
            }

            if (!textToQuote) return; // Si no hay texto, no hacemos nada

            await sock.sendPresenceUpdate('composing', remitente);

            // 2. Datos del Autor
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const targetJid = quoted ? (contextInfo?.participant || contextInfo?.remoteJid) : remitente;
            const name = (quoted ? (msg.message.extendedTextMessage.contextInfo.quotedMessage.pushName || "Usuario") : msg.pushName) || "GECKCORE";

            // 3. Obtener foto de perfil
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            // 4. Construcción de la URL basada EN TU CAPTURA
            // Parámetros detectados: method, avatar, username, text, color, key
            const apiKey = process.env.YUKI_API_KEY;
            const baseURL = "https://api.yuki-wabot.my.id/tools/quotesticker";
            
            const params = new URLSearchParams({
                method: 'URL',
                avatar: ppUrl, // Cambiado de 'url' a 'avatar'
                username: name,
                text: textToQuote,
                color: '#000000', // Negro como en tu captura
                key: apiKey // Cambiado de 'apikey' a 'key' según tu segunda captura
            });

            const finalUrl = `${baseURL}?${params.toString()}`;
            console.log(`[QC DEBUG] URL generada: ${finalUrl}`);

            const response = await fetch(finalUrl);
            
            // La API devuelve directamente la imagen o un JSON con la URL
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                const resultUrl = data.result || data.url;
                if (resultUrl) {
                    await sock.sendMessage(remitente, { sticker: { url: resultUrl } }, { quoted: msg });
                }
            } else {
                // Si la API devuelve la imagen binaria directamente
                const buffer = await response.arrayBuffer();
                await sock.sendMessage(remitente, { sticker: Buffer.from(buffer) }, { quoted: msg });
            }

        } catch (e) {
            console.error('[QC ERROR]:', e.message);
        }
    }
};
