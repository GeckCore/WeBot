// Variable de estado aislada
global.poltergeistActivos = global.poltergeistActivos || {};

export default {
    name: 'notificaciones_fantasma',
    
    match: (text, ctx) => {
        // 1. Activación tuya
        if (/^\.polter/i.test(text) && ctx.msg.key.fromMe) return true;
        
        // 2. Intercepción si el objetivo habla
        if (global.poltergeistActivos[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        
        return false;
    },
    
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        global.poltergeistActivos = global.poltergeistActivos || {};

        // ==========================================
        // FASE 1: ACTIVACIÓN
        // ==========================================
        if (/^\.polter/i.test(textoLimpio) && msg.key.fromMe) {
            
            if (global.poltergeistActivos[remitente]) {
                delete global.poltergeistActivos[remitente];
                return sock.sendMessage(remitente, { text: "⬛ *POLTERGEIST: OFF*" });
            }

            try {
                // Sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

                global.poltergeistActivos[remitente] = true;
                await sock.sendMessage(remitente, { 
                    text: `⬛ *POLTERGEIST: ON*\n\n_Inyección de notificaciones fantasma iniciada._\n_Cada mensaje que envíe generará una vibración sin rastro._` 
                });
            } catch (err) {
                console.error("Falla en Poltergeist:", err);
            }
            return;
        }

        // ==========================================
        // FASE 2: ATAQUE DE VIBRACIÓN
        // ==========================================
        try {
            // Estética agresiva en las reacciones
            const emojis = ['👁️', '⬛', '☠️', '⚠️', '📵'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            // 1. Disparo de la reacción (Fuerza la notificación Push y la vibración)
            await sock.sendMessage(remitente, { react: { text: randomEmoji, key: msg.key } });

            // 2. Retirada táctica a los 800ms
            // Es el tiempo exacto: suficiente para que el móvil suene, 
            // pero imposible de ver si tiene la pantalla bloqueada o está en otra app.
            setTimeout(async () => {
                // Enviar un string vacío es el protocolo nativo de Meta para borrar reacciones
                await sock.sendMessage(remitente, { react: { text: "", key: msg.key } });
            }, 800); 

        } catch (e) {
            console.error("Error en ciclo de reacción:", e);
        }
    }
};
