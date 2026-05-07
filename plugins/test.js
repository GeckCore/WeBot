export default {
    name: 'quote_sticker_v7',
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
            name = name.replace(/[^a-zA-Z0-9]/g, ' ').trim() || "GeckCore";

            // 3. OBTENER BUFFER DE LA FOTO (O de un fallback fiable)
            let ppBuffer;
            try {
                const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
                const res = await fetch(ppUrl);
                ppBuffer = Buffer.from(await res.arrayBuffer());
            } catch (e) {
                // Si falla la foto de WhatsApp, usamos una imagen local o un link muy directo
                const fallback = await fetch('https://i.ibb.co/3pZ6G9k/avatar.png');
                ppBuffer = Buffer.from(await fallback.arrayBuffer());
            }

            // 4. SUBIR A CATBOX (El Puente)
            // Esto genera un link directo que la API de Yuki NO podrá rechazar
            const bodyForm = new FormData();
            bodyForm.append('reqtype', 'fileupload');
            bodyForm.append('fileToUpload', new Blob([ppBuffer], { type: 'image/png' }), 'avatar.png');

            const uploadRes = await fetch('https://catbox.moe/user/api.php', {
                method: 'POST',
                body: bodyForm
            });
            const catboxUrl = await uploadRes.text();

            if (!catboxUrl.startsWith('https')) throw new Error("Fallo al subir avatar temporal.");

            // 5. PETICIÓN A LA API DE YUKI
            const apiKey = process.env.YUKI_API_KEY;
            const params = new URLSearchParams({
                method: 'URL',
                avatar: catboxUrl.trim(),
                username: name,
                text: textToQuote,
                color: '#000000',
                key: apiKey
            });

            const finalUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?${params.toString()}`;

            const response = await fetch(finalUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("[QC API ERROR]:", errData);
                throw new Error(`API Yuki Falló (HTTP ${response.status})`);
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
            // Si todo falla, al menos avisamos en el chat de forma discreta
            // await sock.sendMessage(remitente, { text: '❌ No se pudo generar el sticker.' });
        }
    }
};
