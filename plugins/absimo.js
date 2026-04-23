import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'verificado_newsletter',
    match: (text) => /^\.verify\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.verify\s+/i, '').trim();
        if (!input.includes('|')) return sock.sendMessage(remitente, { text: "❌ Uso: .verify Nombre del Canal | Mensaje" });

        const [nombreCanal, contenido] = input.split('|').map(p => p.trim());

        try {
            // Borrado del rastro
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Construcción del mensaje con metadata de canal verificado
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: contenido,
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1, // Para que parezca un reenvío normal, no masivo
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363123456789012@newsletter', // JID fantasma de canal
                            serverMessageId: 100,
                            newsletterName: nombreCanal // El nombre que tú quieras (ej: "WhatsApp Official")
                        }
                    }
                }
            }, { userJid: sock.user.id });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error en Verify:", err);
        }
    }
};
