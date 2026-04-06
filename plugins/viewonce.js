const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'anti_viewonce',
    // Match: Si respondes "ver" a un mensaje que sea de tipo viewOnce
    match: (text, ctx) => 
        /^ver$/i.test(text) && 
        (ctx.quoted?.viewOnceMessageV2 || ctx.quoted?.viewOnceMessageV2Extension),
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        // Determinamos si es imagen o video dentro del mensaje efímero
        const viewOnce = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message;
        const type = Object.keys(viewOnce)[0]; // imageMessage o videoMessage
        const mediaMsg = viewOnce[type];

        let statusMsg = await sock.sendMessage(remitente, { text: "🔓 Desbloqueando contenido efímero..." }, { quoted: msg });

        try {
            // 1. Descargar el contenido directamente desde los servidores de WA
            const stream = await downloadContentFromMessage(
                mediaMsg, 
                type === 'imageMessage' ? 'image' : 'video'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 2. Reenviar según el tipo
            const caption = `✅ *Contenido desbloqueado*\n_Enviado originalmente por: @${quoted.participant.split('@')[0]}_`;

            if (type === 'imageMessage') {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: caption,
                    mentions: [quoted.participant]
                }, { quoted: msg });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: caption,
                    mentions: [quoted.participant],
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            }

            // Borrar el aviso de carga
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Anti-ViewOnce:", err);
            await sock.sendMessage(remitente, { 
                text: "❌ Error: No se pudo recuperar el archivo. Es posible que el bot no tenga acceso al flujo de datos.", 
                edit: statusMsg.key 
            });
        }
    }
};
