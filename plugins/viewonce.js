const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'ver_efimero',
    match: (text, ctx) => /^ver$/i.test(text) && ctx.msg.message.extendedTextMessage?.contextInfo?.stanzaId,
    
    execute: async ({ sock, remitente, msg }) => {
        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
        const folder = path.join(__dirname, '../data/viewonce');

        if (!fs.existsSync(folder)) {
            return sock.sendMessage(remitente, { text: "❌ No hay caché generado." }, { quoted: msg });
        }

        // Buscamos cualquier archivo que coincida con el ID, sin importar la extensión
        const files = fs.readdirSync(folder);
        const targetFile = files.find(f => f.startsWith(quotedId));

        if (!targetFile) {
            return sock.sendMessage(remitente, { text: "❌ *Error:* El archivo no está en caché. (El bot estaba apagado cuando llegó o ya pasaron 2 horas)." }, { quoted: msg });
        }

        const filePath = path.join(folder, targetFile);
        const buffer = fs.readFileSync(filePath);

        try {
            // Diferenciamos el envío según la extensión guardada
            if (targetFile.endsWith('.mp4')) {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: "✅ *Video de tarea recuperado.*",
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: "✅ *Foto de tarea recuperada.*" 
                }, { quoted: msg });
            }
        } catch (err) {
            console.error("Error al enviar caché:", err);
            await sock.sendMessage(remitente, { text: "❌ Error interno al leer el archivo." });
        }
    }
};
