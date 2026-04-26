global.inceptionTargets = global.inceptionTargets || {};

export default {
    name: 'inception_glitch',
    match: (text, ctx) => {
        if (ctx.msg.key.fromMe && /^\.inception/i.test(text)) return true;
        if (global.inceptionTargets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        return false;
    },
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        
        if (msg.key.fromMe && /^\.inception/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            global.inceptionTargets[remitente] = !global.inceptionTargets[remitente];
            return;
        }

        try {
            // Creamos una estructura de cita "profunda"
            // Metemos el mensaje actual dentro de una cita de sí mismo, alterando el texto
            const deepQuote = {
                key: {
                    remoteJid: remitente,
                    fromMe: false,
                    id: 'INCEPTION_' + Date.now(),
                    participant: remitente
                },
                message: {
                    extendedTextMessage: {
                        text: "Vuelve a leer...",
                        contextInfo: {
                            // Aquí inyectamos el mensaje original como cita de la cita
                            quotedMessage: msg.message
                        }
                    }
                }
            };

            await sock.sendMessage(remitente, { 
                text: "¿Te suena de algo?" 
            }, { quoted: deepQuote });

        } catch (e) {
            console.error("Error en Protocolo Inception:", e);
        }
    }
};
