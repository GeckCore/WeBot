import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'falsa_llamada_o_reunion',
    match: (text) => /^\.(fakellamada|llamada|reunion)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');
        const cmd = textoLimpio.split(/\s+/)[0].toLowerCase();
        const rawInput = textoLimpio.slice(cmd.length).trim();

        // ==========================================
        // MODO 1: REUNIÓN GRUPAL PROGRAMADA (.reunion o .fakellamada grupo)
        // ==========================================
        const isGroupCall = cmd === '.reunion' || /^grupo\b/i.test(rawInput);
        if (isGroupCall) {
            if (!isGroup) {
                return sock.sendMessage(remitente, { text: "❌ Las reuniones grupales solo pueden crearse en grupos." }, { quoted: msg });
            }

            let titulo = rawInput.replace(/^grupo\s*/i, '').trim();
            if (!titulo) titulo = "Reunión de Emergencia del Grupo ⚠️";

            try {
                // Borrar comando para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

                // Inyección de tarjeta de llamada programada nativa
                const waMsg = generateWAMessageFromContent(remitente, {
                    scheduledCallCreationMessage: {
                        scheduledTimestampMs: Date.now() + 900000, // En 15 minutos
                        callType: 1, // 1: VOICE, 2: VIDEO
                        title: titulo
                    }
                }, { userJid: sock.user.id });

                await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });
                return;
            } catch (err) {
                console.error("Error Scheduled Call:", err);
                return sock.sendMessage(remitente, { text: `❌ Error al programar llamada: ${err.message}` });
            }
        }

        // ==========================================
        // MODO 2: CITA DE LLAMADA PERDIDA DE VÍCTIMA (.fakellamada @usuario)
        // ==========================================
        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) {
            return sock.sendMessage(remitente, { 
                text: "❌ Debes mencionar a la persona o usar `.reunion <título>`.\n📌 *Uso:* `.fakellamada @usuario [minutos] | [reacción]`\n_Ejemplo:_ `.fakellamada @usuario 25 | ¿Por qué me llamaste a las 3:00 AM? 💀 Me despertaste`" 
            }, { quoted: msg });
        }

        let duracionSegs = Math.floor(Math.random() * 1200) + 120; // 2 a 22 mins por defecto
        let esVideo = true;
        let reaccion = "¿Por qué me llamaste a esta hora? 💀 Me despertaste...";

        const cleanInput = rawInput.replace(/@\d+/g, '').trim();
        if (cleanInput) {
            const sepIndex = cleanInput.indexOf('|');
            if (sepIndex !== -1) {
                const partParams = cleanInput.slice(0, sepIndex).trim();
                const partResp = cleanInput.slice(sepIndex + 1).trim();

                const parsedMin = parseInt(partParams, 10);
                if (!isNaN(parsedMin) && parsedMin > 0) duracionSegs = parsedMin * 60;
                if (/voz|audio/i.test(partParams)) esVideo = false;
                if (partResp) reaccion = partResp;
            } else {
                const parsedMin = parseInt(cleanInput, 10);
                if (!isNaN(parsedMin) && parsedMin > 0) {
                    duracionSegs = parsedMin * 60;
                } else {
                    reaccion = cleanInput;
                }
            }
        }

        try {
            // Borrado del comando original para sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Inyección en la cita de un registro de llamada perdida
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: {
                    callLogMesssage: {
                        isVideo: esVideo,
                        callOutcome: 1, // MISSED (Llamada perdida)
                        durationSecs: duracionSegs,
                        callType: 0 // REGULAR
                    }
                }
            };

            await sock.sendMessage(remitente, { 
                text: reaccion 
            }, { 
                quoted: mensajeInyectado 
            });

        } catch (err) {
            console.error("Error Fake Call:", err);
            await sock.sendMessage(remitente, { text: `❌ Error al inyectar llamada perdida: ${err.message}` });
        }
    }
};
