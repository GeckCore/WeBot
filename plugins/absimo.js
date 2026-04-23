let stormActive = {};

export default {
    name: 'presence_storm',
    match: (text) => /^\.storm/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const target = msg.key.remoteJid;

        // Si ya está activo, lo apagamos (Toggle)
        if (stormActive[target]) {
            clearInterval(stormActive[target]);
            delete stormActive[target];
            await sock.sendPresenceUpdate('paused', target);
            return sock.sendMessage(remitente, { text: "✅ Tormenta finalizada. Estado restaurado." });
        }

        try {
            // Borramos el comando para sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 1. Nos "suscribimos" a la presencia del objetivo para forzar el canal de datos
            await sock.presenceSubscribe(target);

            // 2. Iniciamos el bucle de saturación
            // WhatsApp apaga el estado "Grabando" a los pocos segundos si no recibe actividad.
            // Nosotros lo reinyectamos cada 4 segundos.
            stormActive[target] = setInterval(async () => {
                // Alternamos entre 'composing' (Escribiendo) y 'recording' (Grabando)
                // para que la barra de estado de la víctima parpadee y sea imposible de ignorar.
                const state = Math.random() > 0.5 ? 'composing' : 'recording';
                await sock.sendPresenceUpdate(state, target);
            }, 4000);

            // Primer disparo inmediato
            await sock.sendPresenceUpdate('recording', target);

        } catch (err) {
            console.error("Error en Storm:", err);
        }
    }
};
