import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

// Sistema de memoria RAM para evitar repetidos
if (!global.memesCache) global.memesCache = new Set();

export default {
    name: 'carrusel_memes',
    // Ahora interceptamos tanto texto normal como IDs ocultos de botones
    match: (text, { msg }) => {
        const buttonId = msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.id || '';
        const comando = text || buttonId;
        return /^\.(memes|cargar_mas_memes)$/i.test(comando);
    },
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        // Extraemos la entrada, venga de donde venga
        const buttonId = msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.id || '';
        const input = (textoLimpio || buttonId).toLowerCase();
        
        // --- INTERCEPTOR DEL BOTÓN TRAMPA ---
        if (input === '.cargar_mas_memes') {
            const regaños = [
                "Deja de perder el tiempo y ponte a estudiar.",
                "Mucho shitpost y poca intensidad hoy. Espabila.",
                "Se acabó el recreo. Cierra esto y haz algo productivo.",
                "No hay más memes para vagos. A tirar pesado o a los libros."
            ];
            const respuesta = regaños[Math.floor(Math.random() * regaños.length)];
            return sock.sendMessage(remitente, { text: respuesta }, { quoted: msg });
        }
        // --------------------------------------------

        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Buscando memes..." }, { quoted: msg });

        try {
            const subreddits = 'MemesEnEspanol+SpanishMeme+yo_elvr';
            const res = await fetch(`https://meme-api.com/gimme/${subreddits}/20`);
            const json = await res.json();

            if (!json.memes || json.memes.length === 0) {
                throw new Error("La API no devolvió resultados.");
            }

            const memesNuevos = json.memes.filter(m => !global.memesCache.has(m.url)).slice(0, 5);

            if (memesNuevos.length === 0) {
                global.memesCache.clear();
                throw new Error("Puros repetidos detectados. Caché limpiada, vuelve a intentar.");
            }

            const cards = [];

            for (let i = 0; i < memesNuevos.length; i++) {
                const meme = memesNuevos[i];
                
                global.memesCache.add(meme.url);

                try {
                    const media = await prepareWAMessageMedia(
                        { image: { url: meme.url } }, 
                        { upload: sock.waUploadToServer }
                    );
                    
                    cards.push({
                        header: { 
                            hasMediaAttachment: true, 
                            imageMessage: media.imageMessage 
                        },
                        body: { 
                            text: `*${meme.title}*\n👍 ${meme.ups} | r/${meme.subreddit}` 
                        },
                        nativeFlowMessage: { 
                            buttons: [
                                // El ID oculto que WhatsApp enviará al tocar el botón
                                { name: "quick_reply", buttonParamsJson: '{"display_text":"🔄 Cargar otros","id":".cargar_mas_memes"}' },
                                { name: "cta_url", buttonParamsJson: `{"display_text":"🌐 Ver original","url":"${meme.postLink}","merchant_url":"${meme.postLink}"}` }
                            ] 
                        }
                    });
                } catch (imgError) {
                    console.error(`Fallo al subir imagen de Reddit:`, imgError.message);
                    continue;
                }
            }

            if (global.memesCache.size > 200) {
                const arrayLimpiado = Array.from(global.memesCache).slice(-100);
                global.memesCache = new Set(arrayLimpiado);
            }

            if (cards.length === 0) throw new Error("Ninguna imagen pudo ser subida a WhatsApp.");

            const interactiveMessage = {
                body: { text: "✦ *MEMES ES* ✦\nDesliza para ver más." },
                footer: { text: "riete porfa" },
                carouselMessage: {
                    cards: cards,
                    messageVersion: 1
                }
            };

            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage
                    }
                }
            }, { quoted: msg });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Carrusel Memes:", err);
            await sock.sendMessage(remitente, { text: `❌ ${err.message}` });
        }
    }
};
