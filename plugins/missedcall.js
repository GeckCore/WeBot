export default {
    name: 'link```_spoofing',
    match: (text) => /^\.link/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.link\s*/i, '').trim();
        if (!input.includes('|')) {
            return sock.sendMessage(remitente, { text: "❌ Formato: .link url | titulo | descripcion" });
        }

        const [urlReal, titulo, desc] = input.split('|').map(p => p.trim());

        try {
            // 1. Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del mensaje de texto con previsualización forzada
            // Usamos un carácter invisible para que el texto del mensaje no estorbe a la previsualización
            const invisibleChar = String.fromCharCode(8203);

            await sock.sendMessage(remitente, {
                text: invisibleChar, 
                contextInfo: {
                    externalAdReply: {
                        title: titulo,
                        body: desc,
                        mediaType: 1, // 1 = IMAGE (Forzar previsualización de enlace)
                        previewType: 0,
                        renderLargerThumbnail: true, // Hace que la imagen sea grande y profesional
                        thumbnailUrl: "[https://files.catbox.moe/0f7e4a.jpg](https://files.catbox.moe/0f7e4a.jpg)", // Opcional: URL de imagen estable o dejar en blanco
                        sourceUrl: urlReal, // El link al que realmente irá al hacer clic
                        showAdAttribution: false // Quita la etiqueta de 'Publicidad'
                    },
                    // Añadimos metadata de reenvío para aumentar la tasa de clics (Psicología)
                    isForwarded: true,
                    forwardingScore: 1
                }
            });

        } catch (err) {
            console.error("Error en Link Spoof:", err);
        }
    }
};
