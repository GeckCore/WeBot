export default {
    name: 'centinela_monitor',
    match: (text) => /^\.(vigile|viewvigile)/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const command = textoLimpio.split(' ')[0].toLowerCase();
        global.db.data.vigilancia = global.db.data.vigilancia || {};

        // --- COMANDO .vigile ---
        if (command === '.vigile') {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            if (global.db.data.vigilancia[remitente]) {
                delete global.db.data.vigilancia[remitente];
                console.log(`[CENTINELA] Vigilancia cancelada para ${remitente}`);
                return;
            }

            global.db.data.vigilancia[remitente] = { logs: [] };
            
            // EL TRUCO: Forzamos la suscripción activa al servidor de Meta
            try {
                await sock.presenceSubscribe(remitente);
            } catch (err) {
                console.error("Fallo al suscribir presencia:", err);
            }
            
            console.log(`[CENTINELA] Ojo fijado. Suscripción de presencia activa para ${remitente}`);
            return;
        }

        // --- COMANDO .viewvigile ---
        if (command === '.viewvigile') {
            const data = global.db.data.vigilancia[remitente];
            
            if (!data || data.logs.length === 0) {
                return sock.sendMessage(remitente, { text: "❌ Base de datos vacía o el objetivo tiene el 'En línea' oculto por privacidad." });
            }

            let informe = `📊 *INFORME DE ACTIVIDAD*\n*Target:* ${remitente.split('@')[0]}\n\n`;
            let tiempoTotal = 0;

            // Mostramos solo las últimas 15 sesiones para no petar el chat
            data.logs.slice(-15).forEach((log, i) => {
                const hInicio = new Date(log.inicio).toLocaleTimeString();
                const hFin = new Date(log.fin).toLocaleTimeString();
                const min = Math.floor(log.duracion / 60000);
                const seg = Math.floor((log.duracion % 60000) / 1000);
                
                informe += `*Sesión ${i + 1}:*\n> ⏳ ${hInicio} - ${hFin}\n> ⏱️ Duración: ${min}m ${seg}s\n\n`;
                tiempoTotal += log.duracion;
            });

            const totalMin = Math.floor(tiempoTotal / 60000);
            informe += `--- \n*TIEMPO TOTAL EN LÍNEA (Últ. 15 ses.):* ${totalMin} minutos.`;

            await sock.sendMessage(remitente, { text: informe });
        }
    }
};
