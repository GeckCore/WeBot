export default {
    name: 'fake_poll_quote',
    match: (text) => /^\.fakepoll(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { text: "❌ Este comando solo se puede usar en grupos." }, { quoted: msg });
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes mencionar a la persona.\n📌 *Uso:* `.fakepoll @usuario pregunta | op1, op2 | [respuesta]`\n_Ejemplo:_ `.fakepoll @usuario ¿Quién invita la pizza hoy? | Yo, Nadie | Yo voto por ti 😂`" 
            }, { quoted: msg });
        }

        const rawInput = textoLimpio.replace(/^\.fakepoll\s*/i, '').replace(/@\d+/g, '').trim();

        let pregunta = "¿Quién es el más simp de este grupo?";
        let opciones = ["Definitivamente yo", "Tú sin duda"];
        let respuesta = "Jajaja ya voté en tu encuesta 🗳️";

        if (rawInput) {
            const parts = rawInput.split('|').map(p => p.trim());
            if (parts[0]) pregunta = parts[0];
            if (parts[1]) {
                const rawOptions = parts[1].split(',').map(o => o.trim()).filter(Boolean);
                if (rawOptions.length >= 2) opciones = rawOptions.slice(0, 5);
            }
            if (parts[2]) respuesta = parts[2];
        }

        try {
            // Borrado del comando original para sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Inyección de encuesta fingida creada por la víctima
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: {
                    pollCreationMessage: {
                        name: pregunta,
                        options: opciones.map(opt => ({ optionName: opt })),
                        selectableOptionsCount: 1
                    }
                }
            };

            await sock.sendMessage(remitente, { 
                text: respuesta 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Poll:", err);
            await sock.sendMessage(remitente, { text: `❌ Error al inyectar encuesta falsa: ${err.message}` });
        }
    }
};
