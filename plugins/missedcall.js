export default {
    name: 'spoof_verification',
    match: (text) => /^\.verify/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción de la VCard con esteroides
            // Añadimos campos que los motores de búsqueda de contactos de WA marcan como "empresa"
            const myJid = sock.user.id.split(':')[0];
            const vcard = 'BEGIN:VCARD\n' +
                          'VERSION:3.0\n' +
                          'FN:✅ Verificado por WhatsApp\n' + // Nombre con el tick visual
                          `TEL;type=CELL;type=VOICE;waid=${myJid}:+${myJid}\n' +
                          'X-WA-BIZ-DESCRIPTION:Cuenta Oficial de Seguridad y Soporte.\n' +
                          'X-WA-BIZ-NAME:WhatsApp Support\n' +
                          'END:VCARD';

            // 3. Envío con inyección de flags de sistema
            await sock.sendMessage(remitente, {
                contacts: {
                    displayName: 'WhatsApp Support ✅',
                    contacts: [{ vcard }]
                },
                contextInfo: {
                    // Este es el "corazón" del verificado visual
                    showAdAttribution: true, 
                    isForwarded: true,
                    forwardingScore: 1, // Para que no parezca spam masivo pero sí algo "oficial"
                    externalAdReply: {
                        title: "ID DE USUARIO VERIFICADO: 0x8221",
                        body: "Este contacto ha pasado las pruebas de seguridad.",
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        thumbnail: Buffer.alloc(0), 
                        sourceUrl: "https://www.whatsapp.com/security",
                        showAdAttribution: true
                    }
                }
            });

        } catch (err) {
            console.error("Error en Verificación Spoof:", err);
        }
    }
};
