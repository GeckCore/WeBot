export default {
    name: 'quote_sticker_v3',
    // Match simplificado para asegurar que siempre dispare
    match: (text) => text.toLowerCase().startsWith('.qc') || text.toLowerCase().startsWith('.quote'),
    
    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        try {
            // 1. Extraer el texto: Prioridad al texto del comando, luego al mensaje citado
            let textToQuote = textoLimpio.replace(/^\.(qc|quote)\s*/i, '').trim();
            
            if (!textToQuote && quoted) {
                textToQuote = quoted.conversation || 
                              quoted.extendedTextMessage?.text || 
                              quoted.imageMessage?.caption || 
                              quoted.videoMessage?.caption || "";
            }

            // Si después de buscar no hay texto, avisamos
            if (!textToQuote) {
                return sock.sendMessage(remitente, { text: '⚠️ *GECKCORE // INFO*\nEscribe un texto o responde a un mensaje para crear el sticker.' });
            }

            await sock.sendPresenceUpdate('composing', remitente);

            // 2. Identificar al autor de la cita
            // Si respondes a alguien, el autor es él. Si no, eres tú.
            const contextInfo = msg.message.extendedTextMessage?.contextInfo;
            const targetJid = quoted ? (contextInfo?.participant || contextInfo?.remoteJid) : remitente;
            
            // Nombre: Usamos el nombre que WhatsApp nos da en el paquete del mensaje
            const name = (quoted ? "Usuario" : msg.pushName) || "GECKCORE User";

            // 3. Obtener la Foto de Perfil (Avatar)
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(targetJid, 'image');
            } catch (e) {
                // Imagen por defecto si falla (perfil privado)
                ppUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
            }

            const apiKey = process.env.YUKI_API_KEY;
            const color = '#1b1429'; // Color de fondo elegante

            // 4. Construcción de la URL (Usando encodeURIComponent para que símbolos como # o & no rompan el link)
            const apiUrl = `https://api.yuki-wabot.my.id/tools/quotesticker?method=URL&url=${encodeURIComponent(ppUrl)}&username=${encodeURIComponent(name)}&text=${encodeURIComponent(textToQuote)}&color=${encodeURIComponent(color)}&apikey=${apiKey}`;

            // Log de depuración para que veas la URL generada en tu consola
            console.log(`[QC DEBUG] Generando cita para: ${name}`);

            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`API respondió con status ${response.status}`);

            const data = await response.json();
            
            // La API de Yuki suele devolver el resultado en .result o .url
            const stickerUrl = data.result || data.url;

            if (!stickerUrl) {
                console.error("[QC API ERROR]:", data);
                throw new Error("No se recibió la URL del sticker.");
            }

            // 5. Envío del Sticker
            await sock.sendMessage(remitente, { 
                sticker: { url: stickerUrl },
                mimetype: 'image/webp'
            }, { quoted: msg });

        } catch (e) {
            console.error('[QC CRITICAL ERROR]:', e.message);
            await sock.sendMessage(remitente, { text: '❌ *ERROR:* No se pudo generar el sticker. Comprueba la API Key o el texto.' });
        }
    }
};
