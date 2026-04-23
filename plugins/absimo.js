import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'modificacion_horaria',
    match: (text) => /^\.time\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const input = textoLimpio.replace(/^\.time\s+/i, '').trim();
        
        // Buscamos el separador "+" para dividir hora y contenido
        if (!input.includes('+')) {
            return sock.sendMessage(remitente, { text: "❌ Formato: .time 3am + mensaje" }, { quoted: msg });
        }

        const [horaStr, contenido] = input.split('+').map(p => p.trim().toLowerCase());

        try {
            // 1. Procesamiento de la hora
            const ahora = new Date();
            let horas, minutos = 0;

            if (horaStr.includes(':')) {
                [horas, minutos] = horaStr.replace(/[ap]m/g, '').split(':').map(Number);
            } else {
                horas = parseInt(horaStr);
            }

            // Ajuste para formato 12h (am/pm)
            if (horaStr.includes('pm') && horas < 12) horas += 12;
            if (horaStr.includes('am') && horas === 12) horas = 0;

            const fechaFalsificada = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), horas, minutos, 0);

            // 2. Destrucción de la evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 3. Generación del paquete con Timestamp inyectado
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: contenido,
                    contextInfo: {
                        isForwarded: false,
                        // Añadimos una cita fantasma para que el mensaje tenga más "cuerpo" en la base de datos
                        quotedMessage: { conversation: "Sincronización de red verificada" }
                    }
                }
            }, { 
                userJid: sock.user.id,
                timestamp: fechaFalsificada // Inyección de la hora falsa
            });

            // 4. Relay directo al servidor
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Time Mod:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en el parseo horario: ${err.message}` });
        }
    }
};
