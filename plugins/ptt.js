export default {
    name: 'suplantacion_cita_v2',
    match: (text) => /^\.fake2\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona a la víctima. Ej: .fake2 @user texto falso | reacción | url" });

        const rawInput = textoLimpio.replace(/^\.fake2\s+/i, '').replace(/@\d+/g, '').trim();
        
        let textoFalso = rawInput;
        let reaccion = "como?"; 
        let urlTrampa = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; 

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) textoFalso = parts[0];
        if (parts.length > 1 && parts[1]) reaccion = parts[1];
        if (parts.length > 2 && parts[2]) urlTrampa = parts[2];
        
        if (!textoFalso) return sock.sendMessage(remitente, { text: "❌ Escribe el texto que quieres falsificar." });

        try {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: { conversation: textoFalso }
            };

            await sock.sendMessage(remitente, { 
                text: reaccion,
                contextInfo: {
                    externalAdReply: {
                        title: "⚠️ Enlace adjunto",
                        body: "Toca para abrir",
                        mediaType: 1,
                        renderLargerThumbnail: false, // <-- Apagado para forzar el diseño compacto
                        thumbnailUrl: "https://i.imgur.com/vHq0AUN.jpeg", 
                        sourceUrl: urlTrampa
                    }
                }
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Quote V2:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico en inyección: ${err.message}` });
        }
    }
};
