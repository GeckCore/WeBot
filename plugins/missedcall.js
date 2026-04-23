export default {
    name: 'audio_infinito',
    match: (text) => /^\.long/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Carga: Un buffer de audio de 1 segundo de silencio total
            // Generamos un silencio base para que no pese nada
            const silencioBase = Buffer.from('UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=', 'base64');

            // 3. Envío con inyección de metadatos
            await sock.sendMessage(remitente, {
                audio: silencioBase,
                mimetype: 'audio/mp4',
                ptt: true, // Lo enviamos como "Nota de voz" para que aparezca la onda
                seconds: 359999, // <--- 99 horas, 59 minutos, 59 segundos
                contextInfo: {
                    externalAdReply: {
                        title: "⌛ ARCHIVO DE AUDIO CORRUPTO",
                        body: "Duración estimada: +99 horas",
                        mediaType: 1,
                        thumbnail: Buffer.alloc(0),
                        showAdAttribution: false
                    }
                }
            });

        } catch (err) {
            console.error("Error en Audio Spoof:", err);
        }
    }
};
