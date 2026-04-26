export default {
    name: 'shadow_mimic_v3',
    match: (text, ctx) => {
        // Solo reacciona al comando .shadow enviado por ti
        return ctx.msg.key.fromMe && /^\.shadow/i.test(text);
    },
    execute: async (ctx) => {
        const { sock, msg, remitente, textoLimpio } = ctx;
        global.shadowTargets = global.shadowTargets || {};

        // Toggle de activación
        try { 
            await sock.sendMessage(remitente, { delete: msg.key }); 
        } catch (e) {}

        global.shadowTargets[remitente] = !global.shadowTargets[remitente];
        
        // Log en consola para que tú sepas si está activo sin decírselo a la víctima
        console.log(`[SHADOW] ${global.shadowTargets[remitente] ? 'ACTIVADO' : 'DESACTIVADO'} para ${remitente}`);
    }
};
