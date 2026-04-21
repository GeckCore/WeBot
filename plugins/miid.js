// Plugin auxiliar para obtener tu ID de WhatsApp
// Coloca en plugins/miid.js

export default {
    name: 'miid',
    match: (text) => /^\.(miid|getid|myid)$/i.test(text),
    
    execute: async ({ sock, remitente, msg }) => {
        
        const esGrupo = remitente.endsWith('@g.us');
        
        let respuesta = `📱 *TU INFORMACIÓN DE WHATSAPP*\n\n`;
        respuesta += `ID Completo:\n\`${remitente}\`\n\n`;
        
        if (esGrupo) {
            respuesta += `⚠️ Esto es un grupo.\n`;
            respuesta += `Para obtener tu ID personal, envía este comando en privado al bot.`;
        } else {
            respuesta += `✅ Copia este ID para configurarlo como OWNER en botclone.js\n\n`;
            respuesta += `*Instrucciones:*\n`;
            respuesta += `1. Edita \`plugins/botclone.js\`\n`;
            respuesta += `2. Busca la línea 11\n`;
            respuesta += `3. Reemplaza con:\n`;
            respuesta += `\`\`\`\nconst OWNER = '${remitente}';\n\`\`\`\n\n`;
            respuesta += `4. Reinicia el bot\n`;
            respuesta += `5. Ya puedes usar \`.botclone\``;
        }
        
        await sock.sendMessage(remitente, { text: respuesta }, { quoted: msg });
    }
};
