export default {
    name: 'monolito_panoptico',
    match: (text) => /^\.void/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo diseñado exclusivamente para grupos." }, { quoted: msg });

        try {
            // 1. Destrucción del desencadenante para mantener el anonimato
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Extracción silenciosa de todos los miembros del grupo
            const groupMetadata = await sock.groupMetadata(remitente);
            const participantsJids = groupMetadata.participants.map(p => p.id);

            // 3. Generación del Bypass de Duplicación (Zero-Width Space)
            const zws = String.fromCharCode(8203);
            const opciones = [];
            
            // Creamos 12 opciones visualmente idénticas pero matemáticamente únicas
            for (let i = 1; i <= 12; i++) {
                opciones.push("Ø" + zws.repeat(i));
            }

            // 4. Inyección del paquete nativo (Encuesta + Ping Fantasma Masivo)
            await sock.sendMessage(remitente, {
                poll: {
                    name: "S I S T E M A   C O M P R O M E T I D O",
                    values: opciones,
                    selectableCount: 1
                },
                // EXPLOIT: Inyectamos a todos los usuarios en los metadatos ocultos.
                // Sus teléfonos sonarán, pero no verán sus nombres escritos en ningún lado.
                contextInfo: {
                    mentionedJid: participantsJids
                }
            });

        } catch (err) {
            console.error("Error en el Monolito:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla en la inyección de protocolo: ${err.message}` });
        }
    }
};
