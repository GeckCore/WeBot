import axios from 'axios';

export default {
    name: 'memes_reddit',
    // Captura .meme
    match: (text) => /^\.meme$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Lista de subreddits de Shitposting, Humor Negro y comunidad "funable" en español
        const subs = [
            'SpanishShitposting', 
            'MAAU', 
            'BeelceReborn', 
            'Dankmemesespanol', 
            'HumorNegro',
            'squareposting',
            'shitposting_es',
            'RodSquare'
        ];
        const randomSub = subs[Math.floor(Math.random() * subs.length)];

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // Intentamos obtener del sub aleatorio
            let res;
            try {
                // Quitamos filtros restrictivos para que pase contenido más "edgy"
                res = await axios.get(`https://meme-api.com/gimme/${randomSub}`);
            } catch (err) {
                // Fallback si el sub específico falla
                res = await axios.get(`https://meme-api.com/gimme/SpanishShitposting`);
            }

            const { title, url, author, postLink, nsfw, subreddit } = res.data;

            // Mantenemos una mención si es NSFW por si quieres saberlo, 
            // pero lo enviamos igualmente ya que es para uso personal.
            const nsfwTag = nsfw ? '🔞 *CONTENIDO EDGY/NSFW*' : '✨';

            await sock.sendMessage(remitente, { 
                image: { url: url }, 
                caption: `${nsfwTag} *${title}*\n\n👤 *Autor:* ${author}\n📂 *Sub:* r/${subreddit}\n🔗 ${postLink}` 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en Memes:', e.message);
            await sock.sendMessage(remitente, { text: '❌ El servidor de memes está caído o el sub es demasiado turbio para la API.' });
        }
    }
};
