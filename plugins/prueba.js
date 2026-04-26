export default {
    name: 'deep_link_trap',
    match: (text) => /^\.trap/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        try {
            // Sigilo: Borrado de evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Lista de disparadores nativos
            const traps = [
                "whatsapp://settings",
                "whatsapp://settings/privacy",
                "whatsapp://qr",
                "whatsapp://type=phone_number&app_absent=0"
            ];
            
            const randomTrap = traps[Math.floor(Math.random() * traps.length)];

            await sock.sendMessage(remitente, {
                text: "⚠️ *CRITICAL:* Integrity check required to continue this chat.",
                contextInfo: {
                    externalAdReply: {
                        title: "WhatsApp Security System",
                        body: "Authentication Token Expired",
                        mediaType: 1,
                        previewType: "PHOTO",
                        thumbnailUrl: "https://www.whatsapp.com/apple-touch-icon.png",
                        // Aquí está el truco: el sourceUrl es un link interno de la app
                        sourceUrl: randomTrap, 
                        renderLargerThumbnail: false
                    }
                }
            });

        } catch (err) {
            console.error("Falla en Protocolo Trap:", err);
        }
    }
};
