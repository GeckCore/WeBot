import axios from 'axios';

export default {
    name: 'memes_reddit',
    // Captura .meme
    match: (text) => /^\.meme$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Lista de subreddits de calidad (español e inglés)
        const subs = ['SpanishMemes', 'memes', 'dankmemes', 'LatinoPeopleTwitter'];
        const randomSub = subs[Math.floor(Math.random() * subs.length)];

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            const res = await axios.get(`https://meme-api.com/gimme/${randomSub}`);
            const { title, url, author, postLink } = res.data;

            // Evitar spoilers si el meme es NSFW (aunque la API suele filtrarlos)
            if (res.data.nsfw) {
                return sock.sendMessage(remitente, { text: '🔞 El meme seleccionado era NSFW y ha sido bloqueado por seguridad.' });
            }

            await sock.sendMessage(remitente, { 
                image: { url: url }, 
                caption: `✨ *${title}*\n\n👤 *Autor:* ${author}\n📂 *Sub:* r/${randomSub}\n🔗 ${postLink}` 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en Memes:', e);
            await sock.sendMessage(remitente, { text: '❌ No pude obtener memes en este momento. Intenta de nuevo.' });
        }
    }
};
