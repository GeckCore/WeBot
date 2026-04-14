import yts from "yt-search";

export default {
    name: 'play_youtube',
    // Reacciona a .play seguido de texto
    match: (text) => /^\.play\s+/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        console.log("▶️ PLAY ejecutado");

        const text = textoLimpio.replace(/^\.play\s+/i, '').trim();

        if (!text) {
            return sock.sendMessage(remitente, { text: `✳️ Ejemplo:\n.play Lil peep` }, { quoted: msg });
        }

        try {
            console.log("🔎 Buscando:", text);

            // Búsqueda usando yt-search
            const searchResult = await yts(text);
            const video = searchResult.videos[0];

            if (!video) {
                console.log("❌ No se encontró video");
                return sock.sendMessage(remitente, { text: "❌ Video no encontrado" }, { quoted: msg });
            }

            console.log("✅ Video encontrado:", video.title);

            const { title, timestamp, views, url, thumbnail } = video;

            // Adaptación de los botones de Telegram a texto de WhatsApp
            const captionText = `🎵 *${title}*\n⏱️ ${timestamp} | 👀 ${views}\n\nPara descargar, copia y usa:\n🎶 *.yta ${url}*\n🎥 *.ytv ${url}*`;

            await sock.sendMessage(remitente, {
                image: { url: thumbnail },
                caption: captionText
            }, { quoted: msg });

        } catch (err) {
            console.log("❌ ERROR PLAY:", err);
            sock.sendMessage(remitente, { text: "❌ Error buscando la música" }, { quoted: msg });
        }
    }
};
