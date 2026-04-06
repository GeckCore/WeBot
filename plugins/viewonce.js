const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'anti_viewonce',
    // Match: Ahora detecta cualquier respuesta 'ver' y luego validamos dentro si es efímero
    match: (text, ctx) => /^ver$/i.test(text) && ctx.quoted,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Buscamos el contenido real dentro de las capas de cebolla de WhatsApp
        const viewOnce = quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
        
        if (!viewOnce) {
            // Si el mensaje citado no es de ver una vez, el bot no hace nada (silencio técnico)
            return;
        }

        const actualMsg = viewOnce.message;
        const type = Object.keys(actualMsg)[0]; // Puede ser 'imageMessage' o 'videoMessage'
        const mediaData = actualMsg[type];

        let statusMsg = await sock.sendMessage(remitente, { text: "🔓 Extrayendo contenido de la tarea..." }, { quoted: msg });

        try {
            // 2. Descargar el flujo de datos
            const stream = await downloadContentFromMessage(
                mediaData, 
                type === 'imageMessage' ? 'image' : 'video'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 3. Preparar el envío
            const caption = `✅ *Contenido desbloqueado*\n_De: @${quoted.participant ? quoted.participant.split('@')[0] : 'usuario'}_`;
            const mentions = quoted.participant ? [quoted.participant] : [];

            if (type === 'imageMessage') {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption, 
                    mentions 
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption, 
                    mimetype: 'video/mp4',
                    mentions 
                }, { quoted: msg });
            }

            // Borramos el aviso de carga
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error en Anti-ViewOnce:", err);
            await sock.sendMessage(remitente, { 
                text: "❌ Error: WhatsApp ya ha eliminado el archivo de sus servidores o el enlace ha expirado.", 
                edit: statusMsg.key 
            });
        }
    }
};
