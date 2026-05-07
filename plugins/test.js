export default {
    name: 'quote_sticker_v8',
    match: (text) => text.toLowerCase().startsWith('.qc') || text.toLowerCase().startsWith('.quote'),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        try {
            // 1. Extraer texto
            let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s*/i, '').trim();
            if (!textToQuote && quoted) {
                textToQuote = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || "";
            }
            if (!textToQuote) return;

            await sock.sendPresenceUpdate('composing', remitente);

            // 2. Obtener JID y Nombre limpio
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const targetJid = quoted ? (contextInfo?.participant || contextInfo?.remoteJid) : remitente;
            let name = (quoted ? "Usuario" : msg.pushName) || "GeckCore";
            name = name.replace(/[^a-zA-Z0-9 ]/g, '').trim() || "GeckCore";

            // 3. Obtener el Buffer de la foto
            let ppBuffer;
            try {
                const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
                const res = await fetch(ppUrl);
                ppBuffer = Buffer.from(await res.arrayBuffer());
            } catch (e) {
                // Fallback limpio
                const fallback = await fetch('https://i.ibb.co/3pZ6G9k/avatar.png');
                ppBuffer = Buffer.from(await fallback.arrayBuffer());
            }

            const apiKey = process.env.YUKI_API_KEY;

            // 4. EL PUENTE: Usar el Uploader de Yuki (Que sabemos que te funciona)
            const uploadForm = new FormData();
            uploadForm.append('file', new Blob([ppBuffer], { type: 'image/png' }), 'avatar.png');

            const uploadRes = await fetch(`https://api.yuki-wabot.my.id/tools/upload?apikey=${apiKey}`, {
                method: 'POST',
                body: uploadForm
            });
            const uploadData = await uploadRes.json();

            if (!uploadData.status || !uploadData.url) {
                console.error("[QC DEBUG UPLOAD]:", uploadData);
                throw new Error("El uploader de Yuki rechazó el avatar.");
            }

            const avatarFinalUrl = uploadData.url;

            // 5. GENERAR EL STICKER
            const params = new URLSearchParams({
                method: 'URL',
                avatar: avatarFinalUrl.trim(),
                username: name,
                text: textToQuote,
                color: '#1b1429', // Cambia a #000000 si prefieres negro puro
                key: apiKey
            });

            const finalUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?${params.toString()}`;

            const response = await fetch(finalUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            if (!response.ok) {
                console.error(`[QC API ERROR]: HTTP ${response.status}`);
                return;
            }

            const data = await response.json();
            const stickerUrl = data.result?.url || data.result || data.url;

            if (stickerUrl) {
                await sock.sendMessage(remitente, { 
                    sticker: { url: stickerUrl },
                    mimetype: 'image/webp'
                }, { quoted: msg });
            }

        } catch (e) {
            console.error('[QC CRITICAL ERROR]:', e.message);
        }
    }
};
