let stormActive = {};

export default {
    name: 'presence_storm_v2',
    match: (text) => /^\.storm/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        const target = msg.key.remoteJid;

        // Lógica de Toggle: Si ya está activo, lo apaga manualmente y sale.
        if (stormActive[target]) {
            clearInterval(stormActive[target].interval);
            clearTimeout(stormActive[target].timeout);
            delete stormActive[target];
            await sock.sendPresenceUpdate('paused', target);
            return; 
        }

        try {
            // 1. Destrucción del comando para no dejar rastro
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Cálculo de duración aleatoria (10 a 30 minutos)
            const minMs = 10 * 60 * 1000;
            const maxMs = 30 * 60 * 1000;
            const randomDuration = Math.floor(Math.random() * (maxMs - minMs + 1) + minMs);

            // 3. Suscripción al canal de presencia
            await sock.presenceSubscribe(target);

            // 4. Inicio del bucle de saturación (Cada 4 segundos)
            const interval = setInterval(async () => {
                const state = Math.random() > 0.5 ? 'composing' : 'recording';
                await sock.sendPresenceUpdate(state, target);
            }, 4000);

            // 5. Configuración del auto-apagado silencioso
            const timeout = setTimeout(async () => {
                if (stormActive[target]) {
                    clearInterval(stormActive[target].interval);
                    delete stormActive[target];
                    await sock.sendPresenceUpdate('paused', target);
                    // No envía mensaje, desaparece sin más.
                }
            }, randomDuration);

            // Guardamos las referencias en memoria
            stormActive[target] = { interval, timeout };

            // Disparo inicial para que la víctima lo vea al instante
            await sock.sendPresenceUpdate('recording', target);

        } catch (err) {
            console.error("Falla en el protocolo de presencia:", err);
        }
    }
};
