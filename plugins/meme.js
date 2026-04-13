import axios from 'axios';

export default {
    name: 'memes_reddit',
    // Captura .meme, .shitpost o .m
    match: (text) => /^\.(meme|shitpost|m)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Subreddits de Shitposting, Humor Negro, Comunidades Edgy y Basadas en español
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
            'Webos',
            'AradirOff',
            'DankMemes'
        ];

        await sock.sendPresenceUpdate('composing', remitente);

        let success = false;
        let attempts = 0;
        let res;

        // Reintentos automáticos para evitar el 404 de Reddit
        while (!success && attempts < 7) {
            const randomSub = subs[Math.floor(Math.random() * subs.length)];
            try {
                res = await axios.get(`https://meme-api.com/gimme/${randomSub}`, { timeout: 5000 });
                if (res.data && res.data.url) success = true;
            } catch (err) {
                attempts++;
                console.log(`[SHITPOST] Falló r/${randomSub} (Intento ${attempts}/7)`);
            }
        }

        if (!success) {
            try {
                res = await axios.get(`https://meme-api.com/gimme`);
                success = true;
            } catch (e) {
                return sock.sendMessage(remitente, { text: '❌ El servidor de memes está tan funado que no responde.' });
            }
        }

        try {
            const { title, url, author, postLink, nsfw, subreddit } = res.data;
            const nsfwTag = nsfw ? '🔞 *CONTENIDO TURBIO*' : '✨';
            
            const caption = `${nsfwTag} *${title}*\n\n👤 *Autor:* ${author}\n📂 *Sub:* r/${subreddit}\n🔗 ${postLink}`;

            // DETECCIÓN DE VIDEO: Si la URL termina en .mp4 o es de ciertos hosts, enviamos como video
            const isVideo = url.includes('.mp4') || url.includes('v.redd.it') || url.includes('.gif');

            if (isVideo) {
                await sock.sendMessage(remitente, { 
                    video: { url: url }, 
                    caption: caption,
                    mimetype: 'video/mp4' 
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    image: { url: url }, 
                    caption: caption 
                }, { quoted: msg });
            }

        } catch (e) {
            console.error('Error enviando shitpost:', e.message);
            await sock.sendMessage(remitente, { text: '❌ Falló el envío. Probablemente el archivo es demasiado pesado para la VPS.' });
        }
    }
};
