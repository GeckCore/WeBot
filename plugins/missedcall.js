export default {
    name: 'ghost_reaction_spam',
    match: (text) => /^\.vibrador/i.test(text),
    execute: async ({ sock, remitente, msg, quoted }) => {
        
        // 1. Verificación estricta: Necesitamos un mensaje de la víctima para reaccionar
        if (!quoted) {
            return sock.sendMessage(remitente, { text: "❌ Debes responder al mensaje de la persona a la que quieres saturar." }, { quoted: msg });
        }

        try {
            // 2. Sigilo: Borramos tu comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 3. Configuración del ataque
            const iteraciones = 10; // 10 vibraciones (ajústalo según quieras, no pases de 20 para no saturar tu propio socket)
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            
            // Emojis aleatorios para evitar filtros de spam por repetición
            const emojis = ['⚠️', '🔥', '💀', '👀', '⚡', '👁️'];

            // 4. Bucle de inyección
            for (let i = 0; i < iteraciones; i++) {
                
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                // ENVIAR REACCIÓN -> Provoca la vibración / sonido
                await sock.sendMessage(remitente, { 
                    react: { text: randomEmoji, key: quoted.key } 
                });

                await delay(300); // Pausa exacta para que el sistema Android/iOS procese la vibración

                // ELIMINAR REACCIÓN -> Borra la notificación de la pantalla
                await sock.sendMessage(remitente, { 
                    react: { text: '', key: quoted.key } 
                });

                await delay(200); // Pausa de enfriamiento del socket
            }

        } catch (err) {
            console.error("Error en Ghost React:", err);
        }
    }
};
