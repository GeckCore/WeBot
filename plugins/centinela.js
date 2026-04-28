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
            console.log(`[CENTINELA] Vigilancia activa para ${remitente}`);
            return;
        }

        // --- COMANDO .viewvigile ---
        if (command === '.viewvigile') {
            const data = global.db.data.vigilancia[remitente];
            
            if (!data || data.logs.length === 0) {
                return sock.sendMessage(remitente, { text: "❌ No hay datos registrados para este contacto aún." });
            }

            let informe = `📊 *INFORME DE ACTIVIDAD*\n*Target:* ${remitente.split('@')[0]}\n\n`;
            let tiempoTotal = 0;

            data.logs.slice(-10).forEach((log, i) => {
                const hInicio = new Date(log.inicio).toLocaleTimeString();
                const hFin = new Date(log.fin).toLocaleTimeString();
                const min = Math.floor(log.duracion / 60000);
                const seg = Math.floor((log.duracion % 60000) / 1000);
                
                informe += `*Sesión ${i + 1}:*\n> ⏳ ${hInicio} - ${hFin}\n> ⏱️ Duración: ${min}m ${seg}s\n\n`;
                tiempoTotal += log.duracion;
            });

            const totalMin = Math.floor(tiempoTotal / 60000);
            informe += `--- \n*TIEMPO TOTAL (Últimas 10 ses.):* ${totalMin} minutos.`;

            await sock.sendMessage(remitente, { text: informe });
        }
    }
};
