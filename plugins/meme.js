import axios from 'axios';

export default {
    name: 'memes_reddit',
    // Captura .meme
    match: (text) => /^\.meme$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Lista de subreddits de Shitposting, Humor Negro y contenido ácido/funable
        const subs = [
            'SpanishShitposting', 
            'MAAU', 
            'BeelceReborn', 
            'Dankmemesespanol', 
            'HumorNegro',
            'squareposting',
            'shitposting_es',
            'RodSquare',
            'orslokx',
            'Webos'
        ];

        await sock.sendPresenceUpdate('composing', remitente);

        let success = false;
        let attempts = 0;
        let res;

        // Sistema de reintentos para evitar el Error 404
        while (!success && attempts < 5) {
            const randomSub = subs[Math.floor(Math.random() * subs.length)];
            try {
                res = await axios.get(`https://meme-api.com/gimme/${randomSub}`, { timeout: 5000 });
                if (res.data && res.data.url) {
                    success = true;
                }
            } catch (err) {
                attempts++;
                console.log(`[MEMES] Falló r/${randomSub} (Intento ${attempts}/5): ${err.message}`);
            }
        }

        // Si después de 5 intentos falla, probamos el feed general como último recurso
        if (!success) {
            try {
                res = await axios.get(`https://meme-api.com/gimme`);
                success = true;
            } catch (e) {
                return sock.sendMessage(remitente, { text: '❌ Todas las fuentes de memes "funables" están caídas o bloqueadas por la API ahora mismo.' });
            }
        }

        try {
            const { title, url, author, postLink, nsfw, subreddit } = res.data;

            // En este modo no bloqueamos nada, solo avisamos si es turbio
            const nsfwTag = nsfw ? '🔞 *HUMOR TURBIO*' : '✨';

            await sock.sendMessage(remitente, { 
                image: { url: url }, 
                caption: `${nsfwTag} *${title}*\n\n👤 *Autor:* ${author}\n📂 *Sub:* r/${subreddit}\n🔗 ${postLink}` 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error enviando el meme:', e.message);
            await sock.sendMessage(remitente, { text: '❌ Error al procesar la imagen del meme.' });
        }
    }
};
