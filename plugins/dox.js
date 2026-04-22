export default {
    name: 'simulador_rastreo_adreply',
    match: (text) => /^\.dox\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo solo para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona al objetivo: .dox @usuario" });

        try {
            // 1. Borrado del comando original
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const numeroLimpio = "+" + mentionedJid.split('@')[0];
            const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            const mac = "00:1B:44:11:3A:B7".replace(/[0-9B]/g, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]);

            // 2. Envío del exploit usando ExternalAdReply (Inmune a bloqueos de Meta)
            await sock.sendMessage(remitente, {
                text: `*INFORME DE VULNERABILIDAD*\n\nObjetivo: ${numeroLimpio}\nIPv4: ${ip}\nMAC: ${mac}\n\n⚠️ *Estado:* DISPOSITIVO INTERCEPTADO.`,
                contextInfo: {
                    mentionedJid: [mentionedJid], // Menciona a la víctima
                    isForwarded: true, // Etiqueta de reenviado
                    forwardedNewsletterMessageInfo: {
                        // Cabecera falsa de Canal oficial
                        newsletterJid: "120363123456789012@newsletter",
                        newsletterName: "TERMINAL ROOT 👁️",
                        serverMessageId: 1
                    },
                    externalAdReply: {
                        // La trampa visual
                        title: "🔴 RASTREO SATELITAL COMPLETADO",
                        body: "📍 Toca para ver coordenadas en vivo",
                        mediaType: 1,
                        renderLargerThumbnail: true, // Fuerza a que la imagen sea gigante
                        thumbnailUrl: "https://i.imgur.com/k6rZc2U.jpeg", // Imagen de radar rojo
                        // EXPLOIT ZERO-KNOWLEDGE:
                        // Abre Maps centrado en la ubicación actual del dispositivo, sin buscador.
                        sourceUrl: "https://www.google.com/maps/@?api=1&map_action=map"
                    }
                }
            }, { quoted: msg }); // Se ancla al chat

        } catch (err) {
            console.error("Error Dox AdReply:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en el envío: ${err.message}` });
        }
    }
};
