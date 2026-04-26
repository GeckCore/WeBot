export default {
    name: 'shadow_mimic',
    match: (text, ctx) => {
        if (ctx.msg.key.fromMe && /^\.shadow/i.test(text)) return true;
        if (global.shadowTargets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        return false;
    },
    execute: async (ctx) => {
        const { sock, msg, remitente, textoLimpio } = ctx;

        // ACTIVACIÓN POR EL DUEÑO
        if (msg.key.fromMe && /^\.shadow/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            global.shadowTargets[remitente] = !global.shadowTargets[remitente];
            return;
        }

        // MODO ECO (Si la víctima envía algo, se lo devolvemos)
        if (global.shadowTargets[remitente] && !msg.key.fromMe) {
            try {
                // Clonamos el mensaje en crudo para que sea idéntico
                let contenido = JSON.parse(JSON.stringify(msg.message));
                
                // Eliminamos marcas de reenvío
                const mType = Object.keys(contenido)[0];
                if (contenido[mType]?.contextInfo) {
                    delete contenido[mType].contextInfo.isForwarded;
                    delete contenido[mType].contextInfo.forwardingScore;
                }

                await sock.sendMessage(remitente, contenido);
            } catch (e) {
                console.error("Error en modo Eco:", e);
            }
        }
    }
};
