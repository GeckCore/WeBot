const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'ver_efimero',
    match: (text, ctx) => /^ver$/i.test(text) && ctx.msg.message.extendedTextMessage?.contextInfo?.stanzaId,
    
    execute: async ({ sock, remitente, msg }) => {
        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
        const folder = path.join(__dirname, '../data/viewonce');

        if (!fs.existsSync(folder)) {
            return sock.sendMessage(remitente, { text: "❌ El directorio de caché no existe." }, { quoted: msg });
        }

        // Buscar el archivo que contenga el ID (ya sea .jpg o .mp4)
        const files = fs.readdirSync(folder);
        const targetFile = files.find(f => f.includes(quotedId));

        if (!targetFile) {
            return sock.sendMessage(remitente, { text: "❌ *Error:* El archivo no está en caché (caducó o el bot no lo registró)." }, { quoted: msg });
        }

        const filePath = path.join(folder, targetFile);
        const buffer = fs.readFileSync(filePath);

        try {
            if (targetFile.endsWith('.mp4')) {
                await sock.sendMessage(remitente, { 
                    video: buffer, 
                    caption: "✅ *Video efímero recuperado.*",
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    caption: "✅ *Imagen efímera recuperada.*" 
                }, { quoted: msg });
            }
        } catch (err) {
            console.error("Error enviando caché:", err);
            await sock.sendMessage(remitente, { text: "❌ Archivo dañado o error de lectura." });
        }
    }
};
