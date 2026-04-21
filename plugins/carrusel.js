import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

// Sistema de memoria RAM para evitar repetidos (Límite dinámico)
if (!global.memesCache) global.memesCache = new Set();

export default {
    name: 'carrusel_memes',
    match: (text) => /^\.memes$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Buscando memes (filtrando repetidos)..." }, { quoted: msg });

        try {
            // Pedimos 20 memes a subreddits hispanos para tener margen de filtrado
            const subreddits = 'MemesEnEspanol+SpanishMeme+yo_elvr';
            const res = await fetch(`https://meme-api.com/gimme/${subreddits}/20`);
            const json = await res.json();

            if (!json.memes || json.memes.length === 0) {
                throw new Error("La API no devolvió resultados.");
            }

            // Filtramos los que ya están en la memoria caché y nos quedamos solo con 5 nuevos
            const memesNuevos = json.memes.filter(m => !global.memesCache.has(m.url)).slice(0, 5);

            if (memesNuevos.length === 0) {
                // Si la API solo devuelve repetidos, reseteamos la caché para evitar bloqueos
                global.memesCache.clear();
                throw new Error("Puros repetidos detectados. Caché limpiada, vuelve a intentar.");
            }

            const cards = [];

            for (let i = 0; i < memesNuevos.length; i++) {
                const meme = memesNuevos[i];
                
                // Guardamos el meme en la memoria para no volver a mostrarlo
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
                                { name: "quick_reply", buttonParamsJson: '{"display_text":"🔄 Cargar otros","id":".memes"}' },
                                { name: "cta_url", buttonParamsJson: `{"display_text":"🌐 Ver original","url":"${meme.postLink}","merchant_url":"${meme.postLink}"}` }
                            ] 
                        }
                    });
                } catch (imgError) {
                    console.error(`Fallo al subir imagen de Reddit:`, imgError.message);
                    continue;
                }
            }

            // Mantenimiento de RAM: Si la caché crece más de 200 items, eliminamos los 100 más viejos
            if (global.memesCache.size > 200) {
                const arrayLimpiado = Array.from(global.memesCache).slice(-100);
                global.memesCache = new Set(arrayLimpiado);
            }

            if (cards.length === 0) throw new Error("Ninguna imagen pudo ser subida a WhatsApp.");

            const interactiveMessage = {
                body: { text: "✦ *MEMES ES* ✦\nDesliza para ver más." },
                footer: { text: "Humor automatizado" },
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
