const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, {
                text: '⚠️ *Uso:* Debes responder al mensaje de "ver una vez" con `.ver`'
            }, { quoted: msg });
        }

        // 1. Extraer la llave desde nuestra RAM interceptada
        const originalMsg = global.mediaCache.get(targetId);

        if (!originalMsg) {
            return await sock.sendMessage(remitente, {
                text: '❌ *Error:* El mensaje no existe en la RAM. Fue enviado antes de iniciar el bot o pasaron más de 60 minutos.'
            }, { quoted: msg });
        }

        // 2. Aplanar capas de Baileys (V1, V2, Ephemeral)
        let content = originalMsg;
        while (content.message || content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension || content.ephemeralMessage || content.documentWithCaptionMessage) {
            content = content.message ||
                      content.viewOnceMessage?.message ||
                      content.viewOnceMessageV2?.message ||
                      content.viewOnceMessageV2Extension?.message ||
                      content.ephemeralMessage?.message ||
                      content.documentWithCaptionMessage?.message ||
                      content;
        }

        // 3. Aislar el contenido decodificable
        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));

        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se detectó contenido multimedia.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', '');

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando...*' }, { quoted: msg });

        try {
            // 4. Descargar usando la llave intacta en RAM
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 5. Envío del archivo
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error de desencriptación:', err.message);
            await sock.sendMessage(remitente, {
                text: '❌ *Fallo técnico:* La llave de desencriptación expiró en los servidores de Meta.'
            }, { quoted: msg });
        }
    }
};
