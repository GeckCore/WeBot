export default {
    name: 'typing_sniper',
    match: (text) => /^\.sniper/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // Sigilo: Borrado del comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            if (global.sniperTargets[remitente]) {
                delete global.sniperTargets[remitente];
                console.log(`[SNIPER] Objetivo liberado: ${remitente}`);
            } else {
                global.sniperTargets[remitente] = true;
                console.log(`[SNIPER] Objetivo fijado: ${remitente}`);
            }

        } catch (err) {
            console.error("Error en comando Sniper:", err);
        }
    }
};
