export default {
    name: 'quote_sticker',
    match: (text) => /^\.(qc|quote)(?:\s+(.*))?$/i.test(text),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        // 1. Determinar el texto a citar
        // Si el usuario escribe algo después del comando, usamos eso. 
        // Si no, y está respondiendo a un mensaje, usamos el texto del mensaje respondido.
        let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s+/i, '').trim();
        
        if (!textToQuote && quoted) {
            textToQuote = quoted.conversation || quoted.extendedTextMessage?.text || "";
        }

        if (!textToQuote) {
            return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // ERROR*\nEscribe un texto o responde a un mensaje para crear la cita.' });
        }

        // 2. Determinar de quién es la cita (Avatar y Nombre)
        const targetJid = quoted ? msg.message.extendedTextMessage.contextInfo.participant : remitente;
        const pushName = quoted ? (msg.message.extendedTextMessage.contextInfo.quotedMessage.pushName || "Usuario") : msg.pushName;

        const apiKey = process.env.YUKI_API_KEY;
        const apiUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?apikey=${apiKey}`;

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // 3. Obtener la foto de perfil (Avatar)
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                // Avatar por defecto si no tiene o es privado
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            // Descargamos el avatar para subirlo a la API (Método Local es más seguro)
            const ppRes = await fetch(ppUrl);
            const ppBuffer = await ppRes.arrayBuffer();

            // 4. Preparar la petición a Yuki API
            const bodyForm = new FormData();
            bodyForm.append('method', 'Local');
            bodyForm.append('file', new Blob([ppBuffer]), 'avatar.jpg');
            bodyForm.append('username', pushName);
            bodyForm.append('text', textToQuote);
            bodyForm.append('color', '#1b1429'); // Un color oscuro elegante tipo WhatsApp

            const response = await fetch(apiUrl, {
                method: 'POST',
                body: bodyForm
            });

            if (!response.ok) throw new Error("API falló al generar la cita.");

            const data = await response.json();

            if (data.status && data.result) {
                // 5. Enviar el resultado como Sticker
                // Baileys procesa automáticamente la imagen a sticker si tienes ffmpeg instalado
                await sock.sendMessage(remitente, { 
                    sticker: { url: data.result },
                    mimetype: 'image/webp'
                }, { quoted: msg });
            } else {
                throw new Error("Estructura de respuesta inválida.");
            }

        } catch (e) {
            console.error('[QUOTE STICKER CRITICAL]:', e);
            await sock.sendMessage(remitente, { text: '❌ *ERROR:* No se pudo generar el sticker de cita.' });
        }
    }
};
