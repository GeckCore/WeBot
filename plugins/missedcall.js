let chaosInterval = {};

export default {
    name: 'group_chaos_loop',
    match: (text) => /^\.chaos/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        if (!remitente.endsWith('@g.us')) return;

        // Toggle: Si ya está activo, lo paramos
        if (chaosInterval[remitente]) {
            clearInterval(chaosInterval[remitente]);
            delete chaosInterval[remitente];
            return sock.sendMessage(remitente, { text: "✅ Caos finalizado." });
        }

        try {
            // Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const nombres = [
                "SISTEMA HACKED", "ERROR 404", "CONEXIÓN PERDIDA", 
                "CARGANDO...", "ADVERTENCIA", "VÍCTIMA DETECTADA"
            ];

            // Bucle de saturación (Cada 2 segundos para evitar ban rápido)
            chaosInterval[remitente] = setInterval(async () => {
                const nuevoNombre = nombres[Math.floor(Math.random() * nombres.length)] + " " + Math.random().toString(36).substring(7);
                
                // Cambiamos el nombre del grupo
                // Esto genera una notificación de sistema en todos los teléfonos del grupo
                await sock.groupUpdateSubject(remitente, nuevoNombre);
                
            }, 2500);

            // Auto-apagado a los 5 minutos para proteger tu número
            setTimeout(() => {
                if (chaosInterval[remitente]) {
                    clearInterval(chaosInterval[remitente]);
                    delete chaosInterval[remitente];
                }
            }, 300000);

        } catch (err) {
            console.error("Error en Chaos Loop:", err);
            if (err.toString().includes('not-authorized')) {
                sock.sendMessage(remitente, { text: "❌ Necesito ser ADMIN para ejecutar este exploit." });
                clearInterval(chaosInterval[remitente]);
                delete chaosInterval[remitente];
            }
        }
    }
};
