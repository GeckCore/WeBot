// Variable de estado aislada
global.poltergeistActivos = global.poltergeistActivos || {};

export default {
    name: 'ghost_vibration_stealth',
    
    match: (text, ctx) => {
        // 1. Activación silenciosa por tu parte
        if (ctx.msg.key.fromMe && /^\.polter/i.test(text)) return true;
        
        // 2. Interceptor de mensajes de la víctima
        if (global.poltergeistActivos[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        
        return false;
    },
    
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        global.poltergeistActivos = global.poltergeistActivos || {};

        // ==========================================
        // FASE 1: ACTIVACIÓN 100% SIGILOSA
        // ==========================================
        if (msg.key.fromMe && /^\.polter/i.test(textoLimpio)) {
            // Borramos tu comando inmediatamente
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            if (global.poltergeistActivos[remitente]) {
                delete global.poltergeistActivos[remitente];
                console.log(`[POLTERGEIST] Desactivado para: ${remitente}`);
            } else {
                global.poltergeistActivos[remitente] = true;
                console.log(`[POLTERGEIST] Activado para: ${remitente}`);
            }
            return; // No enviamos nada al chat, "evidencias borradas"
        }

        // ==========================================
        // FASE 2: ATAQUE RETARDADO (Ghost Trigger)
        // ==========================================
        // Esperamos 5 segundos después de que él envíe el mensaje.
        // Esto da tiempo a que cierre la app o bloquee el móvil.
        setTimeout(async () => {
            if (!global.poltergeistActivos[remitente]) return;

            try {
                const emojis = ['👁️', '⬛', '⚠️', '📵', '💀'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                // 1. Enviamos reacción (dispara notificación y vibración)
                await sock.sendMessage(remitente, { react: { text: randomEmoji, key: msg.key } });

                // 2. La borramos a los 800ms (desaparece antes de que pueda verla)
                setTimeout(async () => {
                    await sock.sendMessage(remitente, { react: { text: "", key: msg.key } });
                }, 800);

            } catch (e) {
                console.error("Error en ciclo Poltergeist:", e);
            }
        }, 5000); // <--- Retraso de 5 segundos para efectividad push
    }
};
