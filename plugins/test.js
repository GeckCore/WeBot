export default {
    name: 'quote_sticker_v6',
    match: (text) => text.toLowerCase().startsWith('.qc') || text.toLowerCase().startsWith('.quote'),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        try {
            let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s*/i, '').trim();
            if (!textToQuote && quoted) {
                textToQuote = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || "";
            }

            if (!textToQuote) return; 

            await sock.sendPresenceUpdate('composing', remitente);

            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const targetJid = quoted ? (contextInfo?.participant || contextInfo?.remoteJid) : remitente;
            
            // LIMPIEZA EXTREMA: Quitamos emojis y símbolos raros del nombre para evitar el error 500
            let name = (quoted ? "Usuario" : msg.pushName) || "GECKCORE";
            name = name.replace(/[^a-zA-Z0-9]/g, ' ').trim(); 
            if (name.length < 2) name = "GeckCore";

            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

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

            // AÑADIMOS HEADERS DE NAVEGADOR (User-Agent) para engañar a la API
            const response = await fetch(finalUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                }
            });

            if (!response.ok) {
                console.error(`[QC ERROR] La API devolvió ${response.status}. URL intentada: ${finalUrl}`);
                return;
            }

            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                const stickerUrl = data.result?.url || data.result || data.url;

                if (stickerUrl) {
                    await sock.sendMessage(remitente, { 
                        sticker: { url: stickerUrl },
                        mimetype: 'image/webp'
                    }, { quoted: msg });
                }
            } else {
                // Si devuelve la imagen directamente
                const buffer = await response.arrayBuffer();
                await sock.sendMessage(remitente, { 
                    sticker: Buffer.from(buffer),
                    mimetype: 'image/webp'
                }, { quoted: msg });
            }

        } catch (e) {
            console.error('[QC CRITICAL ERROR]:', e.message);
        }
    }
};
