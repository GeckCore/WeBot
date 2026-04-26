export default {
    name: 'shadow_mimic_v2',
    match: (text, ctx) => {
        const targets = global.shadowTargets || {};
        if (ctx.msg.key.fromMe && /^\.shadow/i.test(text)) return true;
        if (targets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        return false;
    },
    execute: async (ctx) => {
        const { sock, msg, remitente, textoLimpio } = ctx;
        global.shadowTargets = global.shadowTargets || {};

        if (msg.key.fromMe && /^\.shadow/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            global.shadowTargets[remitente] = !global.shadowTargets[remitente];
            return;
        }

        if (global.shadowTargets[remitente] && !msg.key.fromMe) {
            try {
                // Clonamos el mensaje original
                let contenido = JSON.parse(JSON.stringify(msg.message));
                const mType = Object.keys(contenido)[0];
                
                // Limpieza de metadatos para que parezca un mensaje nuevo y no un reenvío
                if (contenido[mType]?.contextInfo) {
                    delete contenido[mType].contextInfo.isForwarded;
                    delete contenido[mType].contextInfo.forwardingScore;
                }

                // Generamos un ID único para el paquete
                const randomId = 'SHADOW' + Math.random().toString(36).substring(2, 12).toUpperCase();

                // RELAY: Envía el Protobuf crudo. Esto soporta fotos, vídeos, stickers y audios sin error.
                await sock.relayMessage(remitente, contenido, { messageId: randomId });
                
            } catch (e) {
                console.error("Error crítico en relay Shadow:", e);
            }
        }
    }
};
