const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero_mystic',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // 1. Obtener el ID del mensaje original al que el usuario está respondiendo
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Uso:* Debes responder al mensaje de "ver una vez" con `.ver`' 
            }, { quoted: msg });
        }

        let originalMsg = null;

        // 2. Prevención de crasheo: Buscar en store nativo o en nuestra caché RAM optimizada
        if (global.store && typeof global.store.loadMessage === 'function') {
            originalMsg = await global.store.loadMessage(remitente, targetId);
        } else if (global.mediaCache) {
            const cachedMsg = global.mediaCache.get(targetId);
            if (cachedMsg) originalMsg = { message: cachedMsg };
        } else {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Error de Arquitectura:* Tu `index.js` no tiene definido ni `global.store` ni `global.mediaCache`. El bot no tiene una memoria RAM configurada donde buscar el archivo.' 
            }, { quoted: msg });
        }

        if (!originalMsg || !originalMsg.message) {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Error:* El mensaje no está en el registro. Posiblemente fue enviado antes de que el bot estuviera online.' 
            }, { quoted: msg });
        }

        // 3. Aplanar el objeto del mensaje (Desempaquetar la matrioska de Baileys)
        let content = originalMsg.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;

        // 4. Identificar qué tipo de medio es
        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se encontró contenido multimedia en este mensaje.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', ''); // Ej: 'image', 'video'

        await sock.sendMessage(remitente, { text: '⏳ *Extrayendo llave y desencriptando...*' }, { quoted: msg });

        try {
            // 5. Descargar el archivo usando la llave criptográfica preservada en el Store
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 6. Enviar el archivo revelado
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: '👁️ *Contenido Revelado*' 
                }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: '👁️ *Contenido Revelado*' 
                }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { 
                    audio: buffer, 
                    ptt: true 
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error al desencriptar viewOnce:', err);
            await sock.sendMessage(remitente, { 
                text: '❌ *Fallo de Desencriptación:* Los servidores de Meta ya han invalidado la llave de este archivo.' 
            }, { quoted: msg });
        }
    }
};
