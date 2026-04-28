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
            
            try {
                await sock.presenceSubscribe(remitente);
            } catch (err) {
                console.error("Fallo al suscribir presencia:", err);
            }
            
            console.log(`[CENTINELA] Ojo fijado. Suscripción activa para ${remitente}`);
            return;
        }

        // --- COMANDO .viewvigile (REPORTE GLOBAL) ---
        if (command === '.viewvigile') {
            const dataVigilancia = global.db.data.vigilancia || {};
            const targets = Object.keys(dataVigilancia);
            
            if (targets.length === 0) {
                return sock.sendMessage(remitente, { text: "❌ No tienes a nadie bajo vigilancia actualmente." });
            }

            let informeFinal = "📊 *INFORME DE VIGILANCIA GLOBAL*\n\n";
            
            // Forzamos la zona horaria de Canarias
            const opcionesHora = { 
                timeZone: 'Atlantic/Canary', 
                hour12: true, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            };

            for (const target of targets) {
                const logs = dataVigilancia[target].logs || [];
                const numero = target.split('@')[0];
                
                informeFinal += `👤 *Target:* \`+${numero}\`\n`;

                if (logs.length === 0) {
                    informeFinal += `> ❌ Sin registros (perfil oculto o no se ha conectado).\n\n`;
                    informeFinal += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                    continue;
                }

                let tiempoTotal = 0;
                let sesionesTexto = "";

                // Limitamos a las últimas 10 sesiones por persona para no saturar
                logs.slice(-10).forEach((log, i) => {
                    const hInicio = new Date(log.inicio).toLocaleTimeString('es-ES', opcionesHora);
                    const hFin = new Date(log.fin).toLocaleTimeString('es-ES', opcionesHora);
                    const min = Math.floor(log.duracion / 60000);
                    const seg = Math.floor((log.duracion % 60000) / 1000);
                    
                    sesionesTexto += `  *Sesión ${i + 1}:*\n  > ⏳ ${hInicio} - ${hFin}\n  > ⏱️ Duración: ${min}m ${seg}s\n\n`;
                    tiempoTotal += log.duracion;
                });

                const totalMin = Math.floor(tiempoTotal / 60000);
                informeFinal += sesionesTexto;
                informeFinal += `*TIEMPO TOTAL EN LÍNEA:* ${totalMin} minutos.\n`;
                informeFinal += `━━━━━━━━━━━━━━━━━━━━\n\n`;
            }

            await sock.sendMessage(remitente, { text: informeFinal.trim() });
        }
    }
};
