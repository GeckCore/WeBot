const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'ver_efimero',
    // Match: Si respondes "ver" a cualquier mensaje
    match: (text, ctx) => /^ver$/i.test(text) && ctx.msg.message.extendedTextMessage?.contextInfo?.stanzaId,
    
    execute: async ({ sock, remitente, msg }) => {
        // Obtenemos el ID del mensaje citado
        const quotedId = msg.message.extendedTextMessage.contextInfo.stanzaId;
        const filePath = path.join(__dirname, `../data/viewonce/${quotedId}.bin`);

        if (!fs.existsSync(filePath)) {
            return sock.sendMessage(remitente, { text: "❌ *Error:* El archivo no existe o ya pasaron las 2 horas de caché." }, { quoted: msg });
        }

        try {
            const buffer = fs.readFileSync(filePath);
            // WhatsApp no nos dice si el archivo guardado era foto o video en el citado, 
            // así que probamos a enviarlo como imagen (Baileys suele auto-detectar)
            // o puedes chequear el buffer para ser más pro.
            
            await sock.sendMessage(remitente, { 
                image: buffer, 
                caption: "✅ *Contenido recuperado del caché local.*" 
            }, { quoted: msg });

        } catch (err) {
            await sock.sendMessage(remitente, { text: "❌ No pude procesar el archivo guardado." });
        }
    }
};
