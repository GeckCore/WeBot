export default {
    name: 'suplantacion_cita',
    match: (text) => /^\.fake\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Verificamos si estamos en un grupo (no tiene gracia en chat privado)
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });
        }

        // Extraemos a quién mencionó el usuario en el comando
        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { text: "❌ Tienes que mencionar a la víctima. Ej: .fake @usuario Me encanta el reggaeton" });
        }

        // Limpiamos el texto para sacar solo lo que queremos que "diga" la víctima
        // Quitamos el comando y la mención
        const textoFalso = textoLimpio.replace(/^\.fake\s+/i, '').replace(/@\d+/g, '').trim();
        
        if (!textoFalso) {
            return sock.sendMessage(remitente, { text: "❌ Escribe el texto que quieres falsificar." });
        }

        try {
            // --- CONSTRUCCIÓN DEL EXPLOIT ---
            // Creamos un paquete JSON simulando un mensaje legítimo en la base de datos local
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase() // ID hexagonal falso
                },
                message: {
                    conversation: textoFalso
                }
            };

            // El bot responde citando el mensaje inexistente
            await sock.sendMessage(remitente, { 
                text: "📸 Captado en 4K. No puedes borrar eso, ya quedó registrado." 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Quote:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo de inyección: ${err.message}` });
        }
    }
};
