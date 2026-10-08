export default {
    name: 'fake_leak_dm',
    match: (text) => /^\.fakeleak(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { text: "❌ Este comando solo se puede usar en grupos." }, { quoted: msg });
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes mencionar a la persona.\n📌 *Uso:* `.fakeleak @usuario [secreto] | [respuesta]`\n_Ejemplo:_ `.fakeleak @usuario Te extraño mucho, vuelve conmigo | ¿Por qué me mandas esto al privado? Respeta 💀`" 
            }, { quoted: msg });
        }

        const rawInput = textoLimpio.replace(/^\.fakeleak\s*/i, '').replace(/@\d+/g, '').trim();

        let textoSecreto = "Por favor no le cuentes a nadie del grupo lo que te dije ayer...";
        let respuesta = "¿Por qué me escribes esto al privado? No me hables más por favor 💀";

        if (rawInput) {
            const separatorIndex = rawInput.indexOf('|');
            if (separatorIndex !== -1) {
                const partSecret = rawInput.slice(0, separatorIndex).trim();
                const partResp = rawInput.slice(separatorIndex + 1).trim();
                if (partSecret) textoSecreto = partSecret;
                if (partResp) respuesta = partResp;
            } else {
                textoSecreto = rawInput;
            }
        }

        try {
            // Borrado del comando original para sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Inyección de mensaje privado fingido de la víctima
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    remoteJid: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: {
                    conversation: textoSecreto
                }
            };

            await sock.sendMessage(remitente, { 
                text: respuesta 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Leak:", err);
            await sock.sendMessage(remitente, { text: `❌ Error al inyectar mensaje filtrado: ${err.message}` });
        }
    }
};
