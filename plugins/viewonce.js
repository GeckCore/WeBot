const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'revelar',
    // Match para los comandos que traía tu código: read, revelar, readvo
    match: (text, ctx) => /^(readviewonce|read|revelar|readvo|ver)$/i.test(text) && ctx.quoted,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Detectar el contenedor de "Ver una vez" (V1, V2 o Extension)
        const viewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessage || quoted.viewOnceMessageV2Extension;

        if (!viewOnce) return; // Si no es efímero, no hace nada.

        const actualMsg = viewOnce.message;
        const type = Object.keys(actualMsg)[0]; // imageMessage, videoMessage o audioMessage
        const mediaData = actualMsg[type];

        try {
            // 2. Descargar el buffer
            const stream = await downloadContentFromMessage(
                mediaData, 
                type === 'imageMessage' ? 'image' : type === 'videoMessage' ? 'video' : 'audio'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 3. Reenviar según el tipo detectado
            if (/video/.test(type)) {
                return await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: mediaData.caption || '✅ Video revelado',
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } 
            
            if (/image/.test(type)) {
                return await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: mediaData.caption || '✅ Imagen revelada'
                }, { quoted: msg });
            }

            if (/audio/.test(type)) {
                return await sock.sendMessage(remitente, { 
                    audio: buffer, 
                    ptt: true,
                    mimetype: 'audio/ogg; codecs=opus'
                }, { quoted: msg });
            }

        } catch (error) {
            console.error('Error en revelar:', error);
            await sock.sendMessage(remitente, { text: '❌ El archivo ya no está disponible en los servidores de WA.' });
        }
    }
};
