import axios from 'axios';

export default {
    name: 'memes_reddit',
    // Captura .meme
    match: (text) => /^\.meme$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Lista ampliada de subreddits para evitar 404 (mezcla español/inglés)
        const subs = [
            'SpanishMemes', 
            'memexico', 
            'memes', 
            'dankmemes', 
            'wholesomememes', 
            'LatinoPeopleTwitter',
            'terriblefacebookmemes'
        ];
        const randomSub = subs[Math.floor(Math.random() * subs.length)];

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // Intentamos obtener del sub aleatorio
            let res;
            try {
                res = await axios.get(`https://meme-api.com/gimme/${randomSub}`);
            } catch (err) {
                // Fallback: Si el sub falla (404), pedimos un meme aleatorio general
                console.log(`[MEMES] Falló r/${randomSub}, cargando general...`);
                res = await axios.get(`https://meme-api.com/gimme`);
            }

            const { title, url, author, postLink, nsfw, subreddit } = res.data;

            // Filtro de seguridad
            if (nsfw) {
                return sock.sendMessage(remitente, { text: '🔞 El meme seleccionado era NSFW y ha sido omitido por seguridad.' });
            }

            await sock.sendMessage(remitente, { 
                image: { url: url }, 
                caption: `✨ *${title}*\n\n👤 *Autor:* ${author}\n📂 *Sub:* r/${subreddit}\n🔗 ${postLink}` 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error final en Memes:', e.message);
            await sock.sendMessage(remitente, { text: '❌ No hay conexión con el servidor de memes. Intenta de nuevo más tarde.' });
        }
    }
};
