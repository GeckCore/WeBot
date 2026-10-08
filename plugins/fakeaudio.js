export default {
    name: 'fake_audio_quote',
    match: (text) => /^\.fakeaudio(\s+|$)/i.test((text || '').trim()),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { text: "❌ Este comando solo se puede usar en grupos." }, { quoted: msg });
        }

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes mencionar a la persona.\n📌 *Uso:* `.fakeaudio @usuario [segundos] | [reacción]`\n_Ejemplo:_ `.fakeaudio @usuario 42 | No puedo creer lo que dijiste en ese audio 💀`" 
            }, { quoted: msg });
        }

        // Extraer parámetros después del comando y la mención
        const rawInput = textoLimpio.replace(/^\.fakeaudio\s*/i, '').replace(/@\d+/g, '').trim();

        let segundos = Math.floor(Math.random() * 45) + 12; // Duración aleatoria por defecto (12-56s)
        let reaccion = "¿Por qué mandas ese audio aquí? 💀 Borra eso ya...";

        if (rawInput) {
            const separatorIndex = rawInput.indexOf('|');
            if (separatorIndex !== -1) {
                const partSec = rawInput.slice(0, separatorIndex).trim();
                const partReact = rawInput.slice(separatorIndex + 1).trim();

                const parsedSec = parseInt(partSec, 10);
                if (!isNaN(parsedSec) && parsedSec > 0) segundos = Math.min(parsedSec, 600);
                if (partReact) reaccion = partReact;
            } else {
                const parsedSec = parseInt(rawInput, 10);
                if (!isNaN(parsedSec) && parsedSec > 0) {
                    segundos = Math.min(parsedSec, 600);
                } else {
                    reaccion = rawInput;
                }
            }
        }

        try {
            // Borrado del comando original para sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Inyección de mensaje de audio (PTT / nota de voz)
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: {
                    audioMessage: {
                        mimetype: 'audio/ogg; codecs=opus',
                        seconds: segundos,
                        ptt: true
                    }
                }
            };

            await sock.sendMessage(remitente, { 
                text: reaccion 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Audio:", err);
            await sock.sendMessage(remitente, { text: `❌ Error al inyectar nota de voz: ${err.message}` });
        }
    }
};
