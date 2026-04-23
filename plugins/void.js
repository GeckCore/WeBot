import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'desplazamiento_temporal',
    match: (text) => /^\.timejump\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.timejump\s+/i, '').trim();
        if (!input.includes('|')) return sock.sendMessage(remitente, { text: "❌ Formato: .timejump año | mensaje" });

        const [año, contenido] = input.split('|').map(p => p.trim());
        const timestampFalso = Math.floor(new Date(`${año}-01-01`).getTime() / 1000);

        if (isNaN(timestampFalso)) return sock.sendMessage(remitente, { text: "❌ Año inválido." });

        try {
            // Borramos el comando original para no dejar rastro
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // EXPLOIT: Generamos un mensaje con un timestamp forzado manualmente
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: contenido,
                    contextInfo: {
                        isForwarded: true,
                        forwardingScore: 1,
                        // Añadimos una cita a sí mismo para darle más estabilidad al paquete
                        quotedMessage: { conversation: "Archivo Temporal Indexado" }
                    }
                }
            }, { 
                userJid: sock.user.id,
                timestamp: new Date(timestampFalso * 1000) // <--- Aquí ocurre el desplazamiento
            });

            // Inyectamos el paquete directamente en la corriente de datos
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error TimeJump:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla en la sincronización temporal: ${err.message}` });
        }
    }
};
