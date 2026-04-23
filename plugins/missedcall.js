export default {
    name: 'alerta_sistema',
    match: (text) => /^\.alert/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const aviso = textoLimpio.replace(/^\.alert\s*/i, '').trim() || "ACTIVIDAD SOSPECHOSA DETECTADA";

        try {
            // 1. Sigilo: Borramos el activador
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Simulamos 'Grabando audio' para bloquear la barra superior
            await sock.sendPresenceUpdate('recording', remitente);

            // 3. Payload: Construcción de la Alerta de Sistema
            await sock.sendMessage(remitente, {
                text: `⚠️ *NOTIFICACIÓN DE SEGURIDAD*\n\n${aviso}\n\n_Estado: Reportado al servidor central._`,
                contextInfo: {
                    // Esto hace que el mensaje parezca oficial y no un texto cualquiera
                    externalAdReply: {
                        title: "WHATSAPP SECURITY PROTOCOL",
                        body: "ID-ERROR: 0x8004210B",
                        mediaType: 1,
                        previewType: 0,
                        renderLargerThumbnail: false,
                        thumbnail: Buffer.alloc(0), 
                        sourceUrl: "https://support.whatsapp.com",
                        showAdAttribution: true // Añade la etiqueta de "Cuenta Oficial" en algunos clientes
                    },
                    // Forzamos que la notificación aparezca como si fuera un reenvío importante
                    isForwarded: true,
                    forwardingScore: 999
                }
            });

            // 4. Pausa y reset de presencia
            setTimeout(async () => {
                await sock.sendPresenceUpdate('paused', remitente);
            }, 3000);

        } catch (err) {
            console.error("Error en Alerta de Sistema:", err);
        }
    }
};
