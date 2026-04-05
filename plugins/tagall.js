// plugins/tagall.js
module.exports = {
    name: 'tagall',
    match: (text) => /^(tagall|tag|hidetag|notificar)/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted }) => {
        // 1. Validaciones de Grupo y Admin
        if (!remitente.endsWith('@g.us')) return sock.sendMessage(remitente, { text: "❌ Solo en grupos." });

        const groupMetadata = await sock.groupMetadata(remitente);
        const participantes = groupMetadata.participants.map(p => p.id);
        const usuarioActual = msg.key.participant || msg.key.remoteJid;
        const esAdmin = groupMetadata.participants.find(p => p.id === usuarioActual)?.admin;

        if (!esAdmin) return sock.sendMessage(remitente, { text: "⚠️ Comando solo para admins." });

        // 2. Extraer el texto del anuncio
        let anuncio = textoLimpio.replace(/^(tagall|tag|hidetag|notificar)\s*/i, '').trim();
        
        // 3. Lógica de Envío
        try {
            const mediaActual = getMediaInfo(msg.message);
            const mediaCitada = getMediaInfo(quoted);
            const info = mediaActual || mediaCitada;

            if (info) {
                // Caso con Media
                const stream = await downloadContentFromMessage(info.msg, info.type);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const caption = anuncio || info.msg.caption || "";
                const content = {
                    [info.type]: buffer,
                    mentions: participantes
                };
                
                if (info.type !== 'audio') content.caption = caption;
                if (info.type === 'video') content.mimetype = 'video/mp4';
                if (info.type === 'audio') content.mimetype = 'audio/mp4';

                await sock.sendMessage(remitente, content);
            } else {
                // Caso solo Texto
                const textoFinal = anuncio || "📢 ¡Atención a todos!";
                await sock.sendMessage(remitente, { 
                    text: textoFinal, 
                    mentions: participantes 
                });
            }

            // 4. Eliminación del mensaje original (Trigger)
            // Requiere que el bot sea ADMIN para borrar mensajes de otros
            await sock.sendMessage(remitente, { delete: msg.key });

        } catch (err) {
            return sock.sendMessage(remitente, { text: `❌ Error en el comando: ${err.message}` });
        }
    }
};
