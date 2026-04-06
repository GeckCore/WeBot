module.exports = {
    name: 'sistema_warn',
    // Acepta .warn, .advertir, .warning seguidos de mención o respuesta
    match: (text) => /^\.(warn|advertir|advertencia|warning)(\s.+)?$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        // 1. Verificación de Grupo
        if (!msg.key.remoteJid.endsWith('@g.us')) return;

        const chat = msg.key.remoteJid;
        
        // 2. Identificar al objetivo (Mención o Respuesta)
        let target;
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        if (mentioned) {
            target = mentioned;
        } else if (quoted) {
            target = quoted.participant || quoted.key.participant;
        }

        if (!target) {
            return await sock.sendMessage(chat, { 
                text: '⚠️ *Uso correcto:* Menciona a alguien o responde a su mensaje con `.warn [motivo]`' 
            }, { quoted: msg });
        }

        // 3. Evitar que el bot se auto-advierta o advierta al dueño (opcional)
        if (target === sock.user.id.split(':')[0] + '@s.whatsapp.net') return;

        // 4. Gestión en Base de Datos
        if (!global.db.data.users[target]) global.db.data.users[target] = { warn: 0 };
        let user = global.db.data.users[target];
        
        // Inicializar warn si no existe en ese usuario
        if (typeof user.warn !== 'number') user.warn = 0;

        // Extraer motivo
        const motivo = textoLimpio.split(/\s+/).slice(1).join(' ').replace(/@\d+/g, '').trim() || 'Sin motivo especificado';

        user.warn += 1;

        // 5. Respuesta de Advertencia
        await sock.sendMessage(chat, {
            text: `⚠️ *ADVERTENCIA* ⚠️\n\n👤 *Usuario:* @${target.split('@')[0]}\n⚖️ *Motivo:* ${motivo}\n📉 *Contador:* ${user.warn}/3`,
            mentions: [target]
        }, { quoted: msg });

        // 6. Lógica de Expulsión (3/3)
        if (user.warn >= 3) {
            user.warn = 0; // Resetear contador tras expulsión
            
            await sock.sendMessage(chat, {
                text: `🚫 *LÍMITE ALCANZADO*\n\n@${target.split('@')[0]} ha sido eliminado por acumular 3 advertencias.`,
                mentions: [target]
            });

            try {
                // El bot debe ser admin para que esto no falle
                await sock.groupParticipantsUpdate(chat, [target], 'remove');
            } catch (err) {
                await sock.sendMessage(chat, { 
                    text: '❌ *Error:* No pude expulsar al usuario. Asegúrate de que soy administrador.' 
                });
            }
        }
    }
};
