module.exports = {
    name: 'sistema_warn',
    match: (text) => /^\.(warn|advertir|advertencia|warning)(\s.+)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        if (!msg.key.remoteJid.endsWith('@g.us')) return;
        const chat = msg.key.remoteJid;
        
        // Identificar objetivo
        let target;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (mentioned) target = mentioned;
        else if (quoted) target = quoted.participant || quoted.key.participant;

        if (!target) return sock.sendMessage(chat, { text: '⚠️ Menciona a alguien o responde a su mensaje.' });

        // ASEGURAR QUE EL USUARIO EXISTE EN LA DB
        if (!global.db.data.users) global.db.data.users = {};
        if (!global.db.data.users[target]) {
            global.db.data.users[target] = { warn: 0 };
        }
        
        let user = global.db.data.users[target];
        if (typeof user.warn !== 'number') user.warn = 0;

        const motivo = textoLimpio.split(/\s+/).slice(1).join(' ').replace(/@\d+/g, '').trim() || 'Sin motivo';
        user.warn += 1;

        await sock.sendMessage(chat, {
            text: `⚠️ *ADVERTENCIA* @${target.split('@')[0]}\n⚖️ *Motivo:* ${motivo}\n📉 *Contador:* ${user.warn}/3`,
            mentions: [target]
        }, { quoted: msg });

        if (user.warn >= 3) {
            user.warn = 0; 
            await sock.sendMessage(chat, { text: `🚫 @${target.split('@')[0]} eliminado por acumular 3 advertencias.`, mentions: [target] });
            try {
                await sock.groupParticipantsUpdate(chat, [target], 'remove');
            } catch (e) {
                await sock.sendMessage(chat, { text: '❌ No pude expulsarlo. ¿Soy admin?' });
            }
        }
    }
};
