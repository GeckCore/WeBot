const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    // Responde a ver, read, revelar
    match: (text, ctx) => /^(ver|read|revelar)$/i.test(text) && ctx.msg.message.extendedTextMessage?.contextInfo?.stanzaId,
    
    execute: async ({ sock, remitente, msg }) => {
        // Obtenemos el ID único del mensaje original al que respondiste
        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;

        // Buscamos el mensaje original en nuestra memoria RAM
        const originalMsg = global.efimerosCache.get(quotedId);

        if (!originalMsg) {
            return sock.sendMessage(remitente, { 
                text: "❌ El archivo no está en caché. (El bot estaba apagado cuando se envió o ya pasaron 2 horas)." 
            }, { quoted: msg });
        }

        // El mensaje guardado ya es el contenedor limpio (imageMessage o videoMessage)
        const type = Object.keys(originalMsg)[0]; 
        const mediaData = originalMsg[type];

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Desencriptando archivo con llave local..." }, { quoted: msg });

        try {
            // Descargamos usando la información del caché, no del mensaje citado
            const stream = await downloadContentFromMessage(
                mediaData, 
                type === 'imageMessage' ? 'image' : 'video'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (type === 'videoMessage') {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: "✅ *Tarea revelada*",
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: "✅ *Tarea revelada*" 
                }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (error) {
            console.error('Error al desencriptar:', error);
            await sock.sendMessage(remitente, { 
                text: '❌ Error: WhatsApp ya borró el archivo de sus servidores o la llave expiró.',
                edit: statusMsg.key
            });
        }
    }
};
