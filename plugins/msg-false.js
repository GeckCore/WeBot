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
            return sock.sendMessage(remitente, { text: "❌ Tienes que mencionar a la víctima. Ej: .fake @usuario texto|reacción" });
        }

        // Extraemos todo lo que hay después del comando y la mención
        const rawInput = textoLimpio.replace(/^\.fake\s+/i, '').replace(/@\d+/g, '').trim();
        
        let textoFalso = rawInput;
        let reaccion = "como?"; // Reacción predeterminada

        // Buscamos el delimitador |
        const separatorIndex = rawInput.indexOf('|');
        if (separatorIndex !== -1) {
            textoFalso = rawInput.slice(0, separatorIndex).trim();
            const customReaccion = rawInput.slice(separatorIndex + 1).trim();
            // Si hay algo escrito después del |, sustituye el predeterminado
            if (customReaccion) reaccion = customReaccion; 
        }
        
        if (!textoFalso) {
            return sock.sendMessage(remitente, { text: "❌ Escribe el texto que quieres falsificar." });
        }

        try {
            // 1. Destrucción de evidencia
            try {
                await sock.sendMessage(remitente, { delete: msg.key });
            } catch (e) {
                console.log("[INFO] No se pudo borrar el comando (falta admin).");
            }

            // 2. Construcción del exploit en memoria
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

            // 3. Ejecución: El bot responde usando la reacción dinámica
            await sock.sendMessage(remitente, { 
                text: reaccion 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Quote:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo de inyección: ${err.message}` });
        }
    }
};
