const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'anti_viewonce',
    // Match: Detecta 'ver' y verifica si hay un mensaje citado (quoted)
    match: (text, ctx) => /^ver$/i.test(text) && ctx.quoted,
    
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Extraer el mensaje real del contenedor de "Ver una vez"
        // WhatsApp lo anida en viewOnceMessageV2 o viewOnceMessageV1
        const viewOnce = quoted.viewOnceMessageV2?.message || 
                         quoted.viewOnceMessage?.message || 
                         quoted.viewOnceMessageV2Extension?.message;

        if (!viewOnce) {
            // Si el mensaje citado no es efímero, no hacemos nada para no spamear
            return;
        }

        // 2. Identificar si es foto o video
        const type = Object.keys(viewOnce).find(k => k.includes('Message'));
        const mediaMsg = viewOnce[type];

        if (!mediaMsg) return;

        // Feedback visual en consola para que sepas que el bot lo detectó
        console.log(`[SISTEMA] Desbloqueando contenido efímero de tipo: ${type}`);

        let statusMsg = await sock.sendMessage(remitente, { text: "🔓 *Desbloqueando archivo de tarea...*" }, { quoted: msg });

        try {
            // 3. Descargar el buffer
            const stream = await downloadContentFromMessage(
                mediaMsg, 
                type === 'imageMessage' ? 'image' : 'video'
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 4. Reenviar como mensaje normal
            const caption = `✅ *Contenido Recuperado*\n_Este archivo ya no es efímero._`;

            if (type === 'imageMessage') {
                await sock.sendMessage(remitente, { image: buffer, caption }, { quoted: msg });
            } else if (type === 'videoMessage') {
                await sock.sendMessage(remitente, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: msg });
            }

            // Limpieza del mensaje de estado
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("[ERROR] Fallo al recuperar ViewOnce:", err);
            await sock.sendMessage(remitente, { 
                text: "❌ *Error:* El archivo ha expirado o WhatsApp lo ha borrado de sus servidores.", 
                edit: statusMsg.key 
            });
        }
    }
};
