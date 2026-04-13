import fg from "fg-senna";

export default {
    name: 'youtube_dl',
    // Captura tanto .ytmp3 como .ytmp4
    match: (text) => /^\.(ytmp3|ytmp4)\s+/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        const url = args[1];

        if (!url) {
            return sock.sendMessage(remitente, { text: "❌ Envía un link de YouTube válido." }, { quoted: msg });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: `⏳ Procesando ${command.toUpperCase()}...` }, { quoted: msg });

        try {
            if (command === 'ytmp3') {
                await sock.sendPresenceUpdate('recording', remitente);
                let data = await fg.yta(url);
                let title = data.title || "YouTube Audio";

                // FIX CRÍTICO MÓVILES: Descargar el buffer a la memoria RAM primero
                // Evita que Baileys fragmente el archivo y rompa los metadatos en Android/iOS
                const response = await fetch(data.dl_url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                await sock.sendMessage(remitente, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false // ptt: false = Audio normal (canción), ptt: true = Nota de voz
                }, { quoted: msg });

            } else if (command === 'ytmp4') {
                await sock.sendPresenceUpdate('composing', remitente);
                let data = await fg.ytv(url, "480p");
                let title = data.title || "YouTube Video";

                await sock.sendMessage(remitente, {
                    video: { url: data.dl_url },
                    caption: `🎥 *${title}*`
                }, { quoted: msg });
            }

            // Borramos el mensaje de "Procesando..."
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error(`❌ Error en ${command}:`, e);
            sock.sendMessage(remitente, { text: "❌ Error descargando el archivo. La API de fg-senna podría estar caída o el link es inválido.", edit: statusMsg.key });
        }
    }
};
