export default {
    name: 'gps_hardcoded',
    match: (text) => /^\.gps/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        // Configuración estática
        const linkDestino = "https://goo.su/OzNIU7";
        const tituloMapa = "Ubicación en tiempo real";
        const subtexto = "Pulsa para ver la ruta exacta";

        try {
            // Sigilo: Eliminación del comando activador
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Inyección del protocolo de ubicación con redirección forzada
            await sock.sendMessage(remitente, {
                location: { 
                    degreesLatitude: 40.416775, 
                    degreesLongitude: -3.703790 
                },
                name: tituloMapa,
                address: subtexto,
                url: linkDestino,
                jpegThumbnail: Buffer.alloc(0) // Mantiene la burbuja limpia
            });

        } catch (err) {
            console.error("Error en GPS Hardcoded:", err);
        }
    }
};
