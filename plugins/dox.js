export default {
    name: 'simulador_rastreo_texto',
    match: (text) => /^\.dox\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo solo para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona al objetivo: .dox @usuario" });

        try {
            // Borrado del comando original
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const numeroLimpio = "+" + mentionedJid.split('@')[0];
            const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            const mac = "00:1B:44:11:3A:B7".replace(/[0-9B]/g, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]);

            // Mensaje en crudo con la URL de GPS dinámico
            const textoDox = `*INFORME DE VULNERABILIDAD*\n\nObjetivo: ${numeroLimpio}\nIPv4: ${ip}\nMAC: ${mac}\n\n⚠️ *Estado:* DISPOSITIVO INTERCEPTADO.\n\n📍 *Coordenadas en vivo:*\nhttps://www.google.com/maps/@?api=1&map_action=map`;

            await sock.sendMessage(remitente, {
                text: textoDox,
                contextInfo: {
                    mentionedJid: [mentionedJid],
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363123456789012@newsletter",
                        newsletterName: "TERMINAL ROOT 👁️",
                        serverMessageId: 1
                    }
                }
            }, { quoted: msg });

        } catch (err) {
            console.error("Error Dox Raw:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en el envío: ${err.message}` });
        }
    }
};
