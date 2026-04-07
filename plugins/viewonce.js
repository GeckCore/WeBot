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

        // 1. Cargar el mensaje directamente desde la memoria RAM de Baileys
        let originalMsg;
        try {
            originalMsg = await global.store.loadMessage(remitente, targetId);
        } catch (e) {
            console.error('Error al acceder a la RAM:', e);
        }

        if (!originalMsg || !originalMsg.message) {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Error:* El mensaje no existe en la base de datos de RAM. Fue enviado antes de iniciar el bot o ya expiró.' 
            }, { quoted: msg });
        }

        // 2. Bucle agresivo para desempaquetar las capas de cifrado de WhatsApp (V1, V2, Ephemeral)
        let content = originalMsg.message;
        while (content.ephemeralMessage || content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension || content.documentWithCaptionMessage) {
            content = content.ephemeralMessage?.message ||
                      content.viewOnceMessage?.message ||
                      content.viewOnceMessageV2?.message ||
                      content.viewOnceMessageV2Extension?.message ||
                      content.documentWithCaptionMessage?.message ||
                      content;
        }

        // 3. Extraer el nodo multimedia real
        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se detectó contenido multimedia decodificable.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', '');

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando llave desde RAM...*' }, { quoted: msg });

        try {
            // 4. Descarga nativa usando la llave retenida en memoria
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 5. Envío
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error de buffer/descarga:', err.message);
            await sock.sendMessage(remitente, { 
                text: '❌ *Fallo técnico:* La llave de desencriptación expiró en los servidores de Meta.' 
            }, { quoted: msg });
        }
    }
};
