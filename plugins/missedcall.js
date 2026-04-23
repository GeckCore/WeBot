import { generateMessageID } from '@whiskeysockets/baileys';

export default {
    name: 'ring_glitch',
    match: (text) => /^\.ring/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        // Bloqueo de seguridad: Las llamadas directas no funcionan en grupos
        if (remitente.endsWith('@g.us')) {
            return sock.sendMessage(remitente, { text: "❌ Ejecución denegada. Este protocolo solo afecta a terminales individuales (chats privados)." }, { quoted: msg });
        }

        try {
            // Sigilo total: destruimos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Cantidad de ciclos de saturación (5 timbrazos fantasma)
            const loops = 5;
            const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            for (let i = 0; i < loops; i++) {
                // Generamos un ID de llamada único para cada ciclo
                const callId = generateMessageID().substring(0, 16);

                // 1. INYECCIÓN DE OFERTA: Despierta la pantalla y hace vibrar el móvil
                await sock.query({
                    tag: 'call',
                    attrs: {
                        to: remitente,
                        id: generateMessageID()
                    },
                    content: [{
                        tag: 'offer',
                        attrs: {
                            'call-id': callId,
                            'call-creator': myJid
                        },
                        content: [{ tag: 'audio', attrs: {} }] // Especificamos que es llamada de voz
                    }]
                });

                // Mantenemos el teléfono sonando exactamente 1.5 segundos
                // Es el tiempo perfecto para molestar sin dar tiempo a contestar
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 2. INYECCIÓN DE CORTE: Corta la llamada de golpe
                await sock.query({
                    tag: 'call',
                    attrs: {
                        to: remitente,
                        id: generateMessageID()
                    },
                    content: [{
                        tag: 'terminate',
                        attrs: {
                            'call-id': callId,
                            'call-creator': myJid,
                            reason: 'timeout'
                        }
                    }]
                });

                // Pausa corta antes de volver a saturar el procesador de la app
                await new Promise(resolve => setTimeout(resolve, 800));
            }

        } catch (err) {
            console.error("Error en Call Glitch:", err);
        }
    }
};
