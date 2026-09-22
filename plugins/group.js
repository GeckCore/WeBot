export default {
    name: 'control_grupos',
    // Captura ".grupo on" y ".grupo off" ignorando mayúsculas
    match: (text) => /^\.(grupo)\s+(on|off)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const action = textoLimpio.toLowerCase().split(' ')[1];
        
        // Inicializar el objeto si no existe
        if (global.db.data.settings.grupos === undefined) {
            global.db.data.settings.grupos = Boolean(global.defaultGroupsEnabled);
        }

        if (action === 'on') {
            global.db.data.settings.grupos = true;
            await sock.sendMessage(remitente, { text: 'ℹ️ *Información:*\nEste comando ya no es necesario. El bot ahora está configurado para responder SOLO al propietario en todo momento (grupos y privados). Los demás usuarios son ignorados por completo.' }, { quoted: msg });
        } else if (action === 'off') {
            global.db.data.settings.grupos = false;
            await sock.sendMessage(remitente, { text: 'ℹ️ *Información:*\nEste comando ya no es necesario. El bot ahora está configurado para responder SOLO al propietario en todo momento (grupos y privados). Los demás usuarios son ignorados por completo.' }, { quoted: msg });
        }
    }
};
