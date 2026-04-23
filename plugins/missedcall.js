export default {
    name: 'notificacion_fake',
    match: (text) => /^\.noti/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.ghost-msg\s*/i, '').trim();
        if (!input.includes('|')) {
            return sock.sendMessage(remitente, { text: "❌ Formato: .ghost-msg Notificación Falsa | Mensaje Real" });
        }

        const [fake, real] = input.split('|').map(p => p.trim());

        try {
            // 1. Sigilo: Borramos tu comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del Payload
            // Usamos caracteres de salto de línea masivos para limpiar la previsualización
            const filler = Array(50).fill('\n').join('');
            const invisibleChar = '\u200B'; 
            
            // 3. El mensaje final
            // El 'fake' aparece arriba (en la notificación), el 'real' queda oculto abajo
            const payload = `⚠️ ${fake}${filler}${invisibleChar}${real}`;

            await sock.sendMessage(remitente, { text: payload });

        } catch (err) {
            console.error("Error en Ghost Msg:", err);
        }
    }
};
