export default {
    name: 'control_grupos',
    // Captura ".grupo on" y ".grupo off" ignorando mayúsculas
    match: (text) => /^\.(grupo)\s+(on|off)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const action = textoLimpio.toLowerCase().split(' ')[1];
        
        await sock.sendMessage(remitente, { 
            text: 'ℹ️ *Comando obsoleto*\n\nEste comando ha sido eliminado. El bot ahora está configurado permanentemente para responder SOLO al propietario en todo momento (grupos y chats privados). Los demás usuarios son ignorados por completo.\n\nNo es necesario activar/desactivar ningún modo.' 
        }, { quoted: msg });
    }
};
