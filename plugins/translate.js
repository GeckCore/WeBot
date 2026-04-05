// plugins/translate.js
const axios = require('axios');

module.exports = {
    name: 'translate',
    match: (text) => text.toLowerCase() === 'tr',
    execute: async ({ sock, remitente, msg, quoted }) => {
        // 1. Definir tu número (Owner)
        const OWNER_JID = '34682075812@s.whatsapp.net';
        const usuarioActual = msg.key.participant || msg.key.remoteJid;

        // 2. Verificar que seas tú el que envía el comando
        if (usuarioActual !== OWNER_JID) return;

        // 3. Verificar si estás respondiendo a un mensaje
        if (!quoted) {
            return sock.sendMessage(remitente, { text: "⚠️ Responde a un mensaje con *tr* para traducirlo." });
        }

        // 4. Extraer el texto del mensaje citado (soporta texto normal y captions)
        const textoATraducir = quoted.conversation || 
                               quoted.extendedTextMessage?.text || 
                               quoted.imageMessage?.caption || 
                               quoted.videoMessage?.caption || 
                               quoted.documentMessage?.caption;

        if (!textoATraducir) {
            return sock.sendMessage(remitente, { text: "❌ No encontré texto para traducir en ese mensaje." });
        }

        try {
            // 5. Llamada a la API de Google Translate (Auto-detect -> Español)
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(textoATraducir)}`;
            const res = await axios.get(url);

            // Google devuelve un array de arrays, hay que unir las partes
            const traduccion = res.data[0].map(part => part[0]).join('');

            if (!traduccion) throw new Error("Traducción vacía");

            // 6. Enviar la traducción citando el mensaje original
            await sock.sendMessage(remitente, { 
                text: `✨ *Traducción:* \n\n${traduccion}` 
            }, { quoted: msg });

        } catch (error) {
            console.error("Error en traductor:", error);
            await sock.sendMessage(remitente, { text: "❌ Error al conectar con el servidor de traducción." });
        }
    }
};
