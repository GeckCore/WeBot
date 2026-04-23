import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'mensaje_limpio',
    match: (text) => /^\.time\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.time\s+/i, '').trim();
        if (!input.includes('+')) return sock.sendMessage(remitente, { text: "❌ Formato: .time 3am + mensaje" }, { quoted: msg });

        const [horaStr, contenido] = input.split('+').map(p => p.trim());

        try {
            // Borrado del comando original
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Paquete absolutamente limpio. Sin quotes, sin relleno.
            const waMsg = generateWAMessageFromContent(remitente, {
                conversation: contenido
            }, { 
                userJid: sock.user.id
                // Meta ignora el parámetro timestamp inyectado aquí para mensajes nuevos.
            });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error:", err);
        }
    }
};
