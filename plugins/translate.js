// plugins/translate.js
const axios = require('axios');

module.exports = {
    name: 'translate',
    match: (text) => text.toLowerCase() === 'tr',
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Tu número configurado (Asegúrate de que sea este)
        const OWNER_NUMBER = '34682075812'; 
        
        // 2. Extraer el ID de quien envía el comando y LIMPIARLO
        // Esto quita el ":70" o ":1" que Baileys añade a veces
        const sender = msg.key.participant || msg.key.remoteJid;
        const senderNumber = sender.split('@')[0].split(':')[0];

        // 3. Verificación de seguridad
        if (senderNumber !== OWNER_NUMBER) {
            console.log(`[AUTH] Intento de traducción denegado para: ${senderNumber}`);
            return;
        }

        // 4. Verificar si hay un mensaje citado
        if (!quoted) {
            return sock.sendMessage(remitente, { text: "⚠️ Responde a un mensaje con *tr* para traducirlo." });
        }

        // 5. Extraer texto de cualquier tipo de mensaje citado
        const textoATraducir = quoted.conversation || 
                               quoted.extendedTextMessage?.text || 
                               quoted.imageMessage?.caption || 
                               quoted.videoMessage?.caption || 
                               quoted.documentMessage?.caption ||
                               quoted.documentWithCaptionMessage?.message?.documentMessage?.caption;

        if (!textoATraducir) {
            return sock.sendMessage(remitente, { text: "❌ No encontré texto para traducir." });
        }

        try {
            // API de Google Translate
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(textoATraducir)}`;
            const res = await axios.get(url);

            const traduccion = res.data[0].map(part => part[0]).join('');

            await sock.sendMessage(remitente, { 
                text: `✨ *Traducción:* \n\n${traduccion}` 
            }, { quoted: msg });

        } catch (error) {
            console.error("Error en traductor:", error.message);
            await sock.sendMessage(remitente, { text: "❌ Error al traducir." });
        }
    }
};
