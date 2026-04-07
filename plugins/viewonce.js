module.exports = {
    name: 'ver_efimero',
    // Filtro regex para los comandos
    match: (text) => /^\.(readviewonce|read|ver|readvo)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        if (!quoted) {
            return sock.sendMessage(remitente, { 
                text: "⚠️ *Uso:* Responde al mensaje efímero con este comando." 
            }, { quoted: msg });
        }

        try {
            let content = quoted;
            let isViewOnce = false;

            // Detección agresiva de estructuras efímeras (Android, iOS, Web)
            if (content.viewOnceMessage) {
                content = content.viewOnceMessage.message;
                isViewOnce = true;
            } else if (content.viewOnceMessageV2) {
                content = content.viewOnceMessageV2.message;
                isViewOnce = true;
            } else if (content.viewOnceMessageV2Extension) {
                content = content.viewOnceMessageV2Extension.message;
                isViewOnce = true;
            }

            // Identificar el tipo de media
            const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];
            let mediaTypeKey = Object.keys(content || {}).find(k => MEDIA_TYPES.includes(k));

            if (!mediaTypeKey) {
                return sock.sendMessage(remitente, { 
                    text: '❌ No se detectó imagen, video ni audio, o el mensaje ya fue purgado de la RAM.' 
                }, { quoted: msg });
            }

            let mediaMsg = content[mediaTypeKey];
            let type = mediaTypeKey.replace('Message', ''); // 'image', 'video', 'audio'

            // Descargar por CDN
            let media = await downloadContentFromMessage(mediaMsg, type);
            let chunks = [];
            for await (const chunk of media) {
                chunks.push(chunk);
            }
            let buffer = Buffer.concat(chunks);

            // Reenviar el media ya desencriptado
            if (type === 'video') {
                return sock.sendMessage(remitente, { video: buffer, caption: mediaMsg.caption || 'Jeje...' }, { quoted: msg });
            } else if (type === 'image') {
                return sock.sendMessage(remitente, { image: buffer, caption: mediaMsg.caption || 'Jeje...' }, { quoted: msg });
            } else if (type === 'audio') {
                return sock.sendMessage(remitente, { audio: buffer, ptt: !!mediaMsg.ptt }, { quoted: msg });
            }

        } catch (e) {
            console.error('[viewonce] Error de desencriptación:', e);
            return sock.sendMessage(remitente, { 
                text: `❌ *Error técnico al revelar:*\n\`${e.message || 'La llave del mensaje ha caducado.'}\`` 
            }, { quoted: msg });
        }
    }
};
