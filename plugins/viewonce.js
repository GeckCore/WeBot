const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // 1. Obtener el ID del mensaje original al que respondiste
        const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
        const targetId = quotedInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ Responde al mensaje de "ver una vez" con `.ver`' 
            }, { quoted: msg });
        }

        // 2. Buscar el mensaje original en nuestra RAM (El equivalente al store.loadMessage de Mystic)
        const originalMsg = global.mediaCache.get(targetId);

        if (!originalMsg) {
            return await sock.sendMessage(remitente, { 
                text: '❌ Archivo no encontrado en caché. (El bot estaba apagado cuando se envió o expiró la hora).' 
            }, { quoted: msg });
        }

        // 3. Aplanar el mensaje como hace simple.js en Mystic
        let content = originalMsg;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;

        // 4. Identificar el tipo de multimedia y la estructura interna (con la mediaKey intacta)
        const mediaTypeObj = Object.keys(content).find(k => k.includes('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se detectó contenido multimedia.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', ''); // 'image', 'video' o 'audio'

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando llave local...*' }, { quoted: msg });

        try {
            // 5. Descargar usando la mediaKey original
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 6. Reenviar al usuario
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '✅ Revelado' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '✅ Revelado' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error al desencriptar viewOnce:', err);
            await sock.sendMessage(remitente, { 
                text: '❌ Error al desencriptar. Los servidores de Meta ya destruyeron la llave original.' 
            }, { quoted: msg });
        }
    }
};
