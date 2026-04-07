const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// Utilidad matemática: Reconstruye los Buffers (llaves) destruidos al guardarse en JSON
function restoreBuffers(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
        return Buffer.from(obj.data);
    }
    if (Array.isArray(obj)) {
        return obj.map(restoreBuffers);
    }
    for (let key in obj) {
        obj[key] = restoreBuffers(obj[key]);
    }
    return obj;
}

module.exports = {
    name: 'ver_efimero_pro',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Uso:* Debes responder al mensaje de "ver una vez" con `.ver`' 
            }, { quoted: msg });
        }

        // 1. Buscar primero en RAM (Velocidad máxima)
        let originalMsg = global.mediaCache.get(targetId);

        // 2. Si se reinició el bot, buscar en la Base de Datos JSON
        if (!originalMsg) {
            const dbMsg = global.db.data.viewonce?.[targetId];
            if (dbMsg) {
                // Clonamos y reconstruimos las llaves criptográficas
                originalMsg = restoreBuffers(JSON.parse(JSON.stringify(dbMsg)));
            }
        }

        if (!originalMsg) {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Error:* El mensaje no existe en la base de datos de intercepción.' 
            }, { quoted: msg });
        }

        // 3. Aplanar la estructura de Baileys
        let content = originalMsg;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;

        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ No se detectó contenido multimedia.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', '');

        await sock.sendMessage(remitente, { text: '⏳ *Desencriptando...*' }, { quoted: msg });

        try {
            // 4. Descargar usando la mediaKey interceptada
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 5. Enviar el resultado
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
                text: '❌ *Error de Descarga:* La llave es correcta pero Meta ya borró el archivo de sus servidores.' 
            }, { quoted: msg });
        }
    }
};
