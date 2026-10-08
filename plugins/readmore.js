// plugins/readmore.js

module.exports = {
    name: 'readmore',
    match: (text) => /^\.(readmore|leermas|rm|spoiler)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // Extraer lo que viene después del comando
        const rawInput = (textoLimpio || '').replace(/^\.(readmore|leermas|rm|spoiler)\s*/i, '').trim();

        // Validar delimitador '|'
        const sepIndex = rawInput.indexOf('|');
        if (!rawInput || sepIndex === -1) {
            return sock.sendMessage(remitente, {
                text: "❌ *Formato incorrecto.*\n\n📌 *Uso:* `.readmore <texto visible> | <texto oculto>`\n_Ejemplo:_ `.readmore Pulsa para ver el secreto... | ¡Te la creíste! 🤡`"
            }, { quoted: msg });
        }

        const texto1 = rawInput.slice(0, sepIndex).trim();
        const texto2 = rawInput.slice(sepIndex + 1).trim();

        if (!texto1 || !texto2) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Debes incluir tanto el texto visible como el texto oculto separados por `|`.\n_Ejemplo:_ `.readmore Hola | Adiós`"
            }, { quoted: msg });
        }

        // 1. Borrar comando para sigilo
        try {
            await sock.sendMessage(remitente, { delete: msg.key });
        } catch (e) {}

        // 2. Construir mensaje con 4001 caracteres invisibles LTR
        const readMoreChar = String.fromCharCode(8206).repeat(4001);
        const contenidoFinal = `${texto1} ${readMoreChar}\n${texto2}`;

        // 3. Enviar mensaje en el chat
        await sock.sendMessage(remitente, {
            text: contenidoFinal
        });
    }
};
