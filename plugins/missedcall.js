export default {
    name: 'insignia_verificada',
    match: (text) => /^\.v/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const contenido = textoLimpio.replace(/^\.v-msg\s*/i, '').trim() || "Este mensaje ha sido validado por los protocolos de seguridad de WhatsApp.";

        try {
            // 1. Sigilo: Borrado del comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del Mensaje con Inyección de Insignia
            // Reconstruimos la key para evitar el TypeError de 'remoteJid' que tuviste antes
            await sock.sendMessage(remitente, {
                text: contenido,
                contextInfo: {
                    // Estos dos campos fuerzan el renderizado de "Cuenta Oficial"
                    showAdAttribution: true, 
                    externalAdReply: {
                        title: "SISTEMA DE VERIFICACIÓN",
                        body: "Cuenta Protegida por End-to-End Encryption",
                        mediaType: 1,
                        previewType: 0,
                        renderLargerThumbnail: false,
                        thumbnail: Buffer.alloc(0), // Evitamos carga de imagen para que no pese el paquete
                        sourceUrl: "https://www.whatsapp.com/security",
                        showAdAttribution: true // Refuerza el sello visual
                    },
                    // Añadimos metadata de reenvío oficial
                    isForwarded: true,
                    forwardingScore: 1
                }
            });

        } catch (err) {
            console.error("Error en Verificación de Mensaje:", err);
        }
    }
};
