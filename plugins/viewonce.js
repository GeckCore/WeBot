module.exports = {
    name: 'revelar',
    // Match para los comandos: read, revelar, ver
    match: (text, ctx) => /^(read|revelar|ver|readvo)$/i.test(text) && ctx.isViewOnce,
    
    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        // 'quoted' aquí ya es el mensaje interno (imageMessage o videoMessage) gracias al index.js
        const type = Object.keys(quoted)[0]; 
        const mediaData = quoted[type];

        try {
            // Descargamos el buffer (exactamente como en The Mystic)
            const stream = await downloadContentFromMessage(
                mediaData, 
                type === 'imageMessage' ? 'image' : type === 'videoMessage' ? 'video' : 'audio'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (/video/.test(type)) {
                return await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: mediaData.caption || '',
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } 
            
            if (/image/.test(type)) {
                return await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: mediaData.caption || '',
                    mimetype: 'image/jpeg'
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
            console.error('Error al revelar:', error);
            await sock.sendMessage(remitente, { text: '❌ Error: No se pudo descargar. El archivo ya fue abierto o expiró.' });
        }
    }
};
