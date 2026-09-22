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
            respuesta += `✅ Copia este ID para configurarlo como propietario del bot.\n\n`;
            respuesta += `*Instrucciones:*\n`;
            respuesta += `1. Define la variable \`OWNER_NUMBER\`\n`;
            respuesta += `2. Valor sugerido:\n`;
            respuesta += `\`\`\`\nOWNER_NUMBER=${remitente}\n\`\`\`\n\n`;
            respuesta += `3. Reinicia el bot\n`;
            respuesta += `4. Ya puedes usar comandos privados`;
        }
        
        await sock.sendMessage(remitente, { text: respuesta }, { quoted: msg });
    }
};
