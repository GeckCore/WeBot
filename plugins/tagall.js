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
        
        // 3. Lógica Multimedia (Basada en el código que pasaste)
        // Revisamos si el mensaje actual tiene media o si el mensaje citado (quoted) tiene media
        const mediaActual = getMediaInfo(msg.message);
        const mediaCitada = getMediaInfo(quoted);
        const info = mediaActual || mediaCitada;

        if (info) {
            // Si hay media, descargamos y enviamos mensaje nuevo con menciones
            try {
                const stream = await downloadContentFromMessage(info.msg, info.type);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const caption = anuncio || info.msg.caption || "";
                const content = {};
                content[info.type] = buffer;
                content.caption = caption;
                content.mentions = participantes;

                if (info.type === 'video') content.mimetype = 'video/mp4';
                if (info.type === 'audio') {
                    content.mimetype = 'audio/mp4';
                    delete content.caption; // El audio no lleva caption
                }

                return await sock.sendMessage(remitente, content, { quoted: msg });
            } catch (err) {
                return sock.sendMessage(remitente, { text: `❌ Error al procesar media: ${err.message}` });
            }
        }

        // 4. Lógica de Texto (Editar el mensaje enviado)
        // Si no hay media, simplemente editamos el mensaje original añadiendo las menciones
        const textoFinal = anuncio || "📢 ¡Atención a todos!";
        
        // El truco del hidetag: metemos las menciones en el array 'mentions' 
        // aunque no aparezcan los @números en el texto, a todos les llegará la notificación.
        await sock.sendMessage(remitente, { 
            text: textoFinal, 
            edit: msg.key, 
            mentions: participantes 
        });
    }
};
