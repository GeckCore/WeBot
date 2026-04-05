// plugins/tagall.js
module.exports = {
    name: 'tagall',
    match: (text) => text.toLowerCase().startsWith('tagall'),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // 1. Verificar si es un grupo
        if (!remitente.endsWith('@g.us')) {
            return sock.sendMessage(remitente, { text: "❌ Este comando solo funciona en grupos." });
        }

        // 2. Obtener metadata y participantes
        const groupMetadata = await sock.groupMetadata(remitente);
        const participantes = groupMetadata.participants;
        const usuarioActual = msg.key.participant || msg.key.remoteJid;

        // 3. Verificar si quien envía es admin
        const esAdmin = participantes.find(p => p.id === usuarioActual)?.admin;
        if (!esAdmin) {
            return sock.sendMessage(remitente, { text: "⚠️ Solo los administradores pueden usar este comando." });
        }

        // 4. Preparar el texto y las menciones
        const anuncioTexto = textoLimpio.replace(/tagall/i, '').trim() || "Atención a todos";
        
        let menciones = [];
        let mencionesTexto = "";

        participantes.forEach(p => {
            menciones.push(p.id);
            mencionesTexto += `@${p.id.split('@')[0]} `;
        });

        const mensajeFinal = `📢 *ANUNCIO GENERAL*\n\n*Mensaje:* ${anuncioTexto}\n\n${mencionesTexto}`;

        // 5. Editar el mensaje original con el anuncio y las menciones
        await sock.sendMessage(remitente, { 
            text: mensajeFinal, 
            edit: msg.key, 
            mentions: menciones 
        });
    }
};
