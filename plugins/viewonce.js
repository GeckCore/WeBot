const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // 1. Identificar el ID del mensaje al que respondes
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Uso:* Debes responder al mensaje de "ver una vez" con `.ver`' 
            }, { quoted: msg });
        }

        if (!global.store) {
            return await sock.sendMessage(remitente, { text: '❌ Error: El sistema de almacenamiento en memoria no está activo.' });
        }

        // 2. Extraer el mensaje original de la RAM (Método oficial de Baileys/Mystic)
        let originalMsg;
        try {
            originalMsg = await global.store.loadMessage(remitente, targetId);
        } catch (e) {
            console.error('Fallo al buscar en el store:', e);
        }

        if (!originalMsg || !originalMsg.message) {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Error:* El mensaje no está en la memoria. Ocurre si el bot se reinició después de que enviaran la foto.' 
            }, { quoted: msg });
        }

        // 3. Aplanar el mensaje (Desempaquetar la estructura de Baileys)
        let content = originalMsg.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;

        // 4. Buscar el nodo multimedia
        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se detectó contenido multimedia.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', '');

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando...*' }, { quoted: msg });

        try {
            // 5. Descargar usando la mediaKey preservada en la memoria
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 6. Enviar
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error desencriptando:', err.message);
            await sock.sendMessage(remitente, { 
                text: '❌ *Fallo técnico:* No se pudo descargar el archivo. Es probable que la llave criptográfica haya expirado.' 
            }, { quoted: msg });
        }
    }
};
