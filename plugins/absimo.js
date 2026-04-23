import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'verificado_newsletter_v2',
    match: (text) => /^\.verify/i.test(text), // Regex más flexible
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.verify\s*/i, '').trim();
        const [nombreCanal, contenido] = input.includes('|') 
            ? input.split('|').map(p => p.trim()) 
            : ["WhatsApp News", input || "Verificación de cuenta completada."];

        try {
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: contenido,
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363000000000000@newsletter',
                            serverMessageId: 1,
                            newsletterName: nombreCanal
                        }
                    }
                }
            }, { userJid: sock.user.id });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });
        } catch (e) { console.error(e); }
    }
};
