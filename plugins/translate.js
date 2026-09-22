// plugins/translate.js
const axios = require('axios');

module.exports = {
    name: 'translate',
    match: (text) => /^\.tr$/i.test((text || '').trim()),
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Verificar si hay un mensaje citado
        if (!quoted) {
            return sock.sendMessage(remitente, { text: "⚠️ Responde a un mensaje con *.tr* para traducirlo." });
        }

        // 2. Extraer texto de cualquier tipo de mensaje citado
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
            // 3. API de Google Translate
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
