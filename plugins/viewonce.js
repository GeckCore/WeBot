const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, {
                text: '⚠️ *Uso:* Debes responder al mensaje de "ver una vez" con `.read`'
            }, { quoted: msg });
        }

        // 1. Cargar desde nuestra caché clonada y blindada
        const originalMsg = global.mediaCache.get(targetId);

        if (!originalMsg || !originalMsg.message) {
            return await sock.sendMessage(remitente, {
                text: '❌ *Error:* El mensaje no existe en la RAM. Fue enviado antes de arrancar el bot o fue purgado.'
            }, { quoted: msg });
        }

        // 2. Desempaquetador Agresivo (Rompe todas las capas de cifrado V1, V2 y Extensiones)
        let content = originalMsg.message;
        let unwrapped = true;
        
        while (unwrapped) {
            if (content?.ephemeralMessage) content = content.ephemeralMessage.message;
            else if (content?.viewOnceMessage) content = content.viewOnceMessage.message;
            else if (content?.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
            else if (content?.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
            else if (content?.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;
            else unwrapped = false; // Se acabaron las capas de seguridad
        }

        // 3. Buscar la llave de medio real garantizada
        const mediaTypeObj = Object.keys(content).find(k => 
            k === 'imageMessage' || 
            k === 'videoMessage' || 
            k === 'audioMessage'
        );

        if (!mediaTypeObj) {
            console.error('[CRÍTICO] Estructura no reconocida de WhatsApp:', JSON.stringify(content, null, 2));
            return await sock.sendMessage(remitente, { 
                text: '❌ No se detectó contenido multimedia. Es posible que sea un tipo de mensaje efímero no soportado.' 
            }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', ''); // Ej: 'image'

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando capa de seguridad...*' }, { quoted: msg });

        try {
            // 4. Descargar usando la llave blindada en RAM
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 5. Enviar el resultado al chat
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '👁️ *Contenido Revelado*' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '👁️ *Contenido Revelado*' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Error de desencriptación (ViewOnce):', err.message);
            await sock.sendMessage(remitente, {
                text: '❌ *Fallo técnico:* La llave criptográfica ha sido completamente invalidada por los servidores de Meta.'
            }, { quoted: msg });
        }
    }
};
