import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'revocacion_fantasma',
    match: (text) => /^\.ghostrevoke/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        // 1. Necesitas responder al mensaje que quieres "borrar"
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.stanzaId) {
            return sock.sendMessage(remitente, { text: "❌ Responde al mensaje que quieres hacer desaparecer." }, { quoted: msg });
        }

        try {
            // 2. Extraemos los metadatos reales del mensaje objetivo
            const targetJid = quotedMsg.participant || remitente;
            const targetId = quotedMsg.stanzaId;

            // 3. Generamos el paquete de Protocolo de Revocación
            // Este paquete le dice a TODA la red de WhatsApp: "El mensaje ID X ha sido revocado".
            const waMsg = generateWAMessageFromContent(remitente, {
                protocolMessage: {
                    key: {
                        remoteJid: remitente,
                        fromMe: false, // Falsificamos que la orden viene del servidor o del autor
                        id: targetId
                    },
                    type: 0 // Tipo 0 = REVOKE (Eliminación forzada)
                }
            }, { userJid: sock.user.id });

            // 4. Inyección del paquete de red
            // No enviamos un mensaje, enviamos una instrucción de protocolo
            await sock.relayMessage(remitente, waMsg.message, { messageId: targetId });

            // 5. Destrucción de nuestra evidencia (para no dejar rastro)
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        } catch (err) {
            console.error("Error GhostRevoke:", err);
            sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
        }
    }
};
