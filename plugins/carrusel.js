import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

export default {
    name: 'carrusel_memes',
    match: (text) => /^\.memes$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Extrayendo memes de Reddit..." }, { quoted: msg });

        try {
            // Obtenemos 5 memes aleatorios del subreddit shitposting (puedes cambiarlo por 'memes', 'dankmemes', etc.)
            const res = await fetch('https://meme-api.com/gimme/shitposting/5');
            const json = await res.json();

            if (!json.memes || json.memes.length === 0) {
                throw new Error("La API de Reddit no devolvió resultados.");
            }

            const cards = [];

            // Procesamos cada meme y lo preparamos para el carrusel
            for (let i = 0; i < json.memes.length; i++) {
                const meme = json.memes[i];
                
                try {
                    // Pre-subimos la imagen a los servidores de WhatsApp
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
                            // Título del post de Reddit
                            text: `*${meme.title}*\n👍 ${meme.ups} upvotes` 
                        },
                        nativeFlowMessage: { 
                            buttons: [
                                // Botón que ejecuta el comando de nuevo automáticamente
                                { 
                                    name: "quick_reply", 
                                    buttonParamsJson: '{"display_text":"🔄 Cargar otros","id":".memes"}' 
                                },
                                // Botón para ir al post original
                                { 
                                    name: "cta_url", 
                                    buttonParamsJson: `{"display_text":"🌐 Ver original","url":"${meme.postLink}","merchant_url":"${meme.postLink}"}` 
                                }
                            ] 
                        }
                    });
                } catch (imgError) {
                    // Si una imagen falla (pesa mucho o da timeout), la saltamos para no romper todo el carrusel
                    console.error(`Fallo al cargar meme ${i}:`, imgError.message);
                    continue;
                }
            }

            if (cards.length === 0) {
                throw new Error("Ninguna imagen pudo ser procesada a tiempo.");
            }

            // Construimos la estructura final del carrusel interactivo
            const interactiveMessage = {
                body: { text: "✦ *SHITPOSTING* ✦\nDesliza para ver más memes." },
                footer: { text: "Reddit Fetcher API" },
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

            // Enviamos el paquete crudo y borramos el mensaje de espera
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error Carrusel Memes:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico: ${err.message}` });
        }
    }
};
