export default {
    name: 'control_grupos',
    // Captura ".grupo on" y ".grupo off" ignorando mayúsculas
    match: (text) => /^\.(grupo)\s+(on|off)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const action = textoLimpio.toLowerCase().split(' ')[1];
        
        // Inicializar el objeto si no existe
        if (global.db.data.settings.grupos === undefined) {
            global.db.data.settings.grupos = true;
        }

        if (action === 'on') {
            global.db.data.settings.grupos = true;
            await sock.sendMessage(remitente, { text: '✅ *Grupos Activados:*\nEl bot ahora responderá a los comandos en todos los grupos.' }, { quoted: msg });
        } else if (action === 'off') {
            global.db.data.settings.grupos = false;
            await sock.sendMessage(remitente, { text: '❌ *Grupos Desactivados:*\nEl bot ignorará cualquier comando en grupos (excepto `.grupo on`). En privado seguirá funcionando 100%.' }, { quoted: msg });
        }
    }
};
