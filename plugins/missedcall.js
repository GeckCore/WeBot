export default {
    name: 'fake_missed_call',
    match: (text) => /^\.missed/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Destrucción inmediata del comando activador
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Generación de timestamp en formato 24h
            const horaActual = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

            // 3. Inyección del Payload UI
            // El texto es un ZWSP (Zero Width Space), hace que el contenedor base sea invisible
            await sock.sendMessage(remitente, {
                text: String.fromCharCode(8203), 
                contextInfo: {
                    externalAdReply: {
                        title: "📞 Llamada de voz perdida",
                        body: `Hoy a las ${horaActual}`,
                        mediaType: 1, // Fuerza el renderizado tipo banner
                        previewType: 0,
                        renderLargerThumbnail: false,
                        thumbnail: Buffer.alloc(0), // Buffer vacío = sin imagen, máxima limpieza
                        sourceUrl: "whatsapp://call?number=" + sock.user.id.split(':')[0], // Deep-link nativo
                        showAdAttribution: false
                    }
                }
            });

        } catch (err) {
            console.error("Error en Spoof de Llamada Perdida:", err);
        }
    }
};
