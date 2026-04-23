export default {
    name: 'gps_spoof',
    match: (text) => /^\.gps/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Uso: .gps https://tu-link.com | Nombre de la ubicación
        const input = textoLimpio.replace(/^\.gps\s*/i, '').trim();
        const [urlTrampa, titulo] = input.split('|').map(p => p.trim());

        if (!urlTrampa) return sock.sendMessage(remitente, { text: "❌ Formato: .gps url | titulo" });

        try {
            // Sigilo: Borrado del comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Envío del mensaje de ubicación con redirección
            await sock.sendMessage(remitente, {
                location: { 
                    degreesLatitude: 40.416775, 
                    degreesLongitude: -3.703790 
                },
                name: titulo || 'Ubicación en tiempo real',
                address: 'Haz clic para ver la ruta en el mapa',
                url: urlTrampa, // Aquí es donde ocurre la redirección
                jpegThumbnail: Buffer.alloc(0) // Imagen del mapa (vía buffer)
            });

        } catch (err) {
            console.error("Error en comando GPS:", err);
        }
    }
};

