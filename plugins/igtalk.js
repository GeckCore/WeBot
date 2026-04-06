const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
    name: 'igstalk',
    // Match para .igstalk [usuario] o .ig [usuario]
    match: (text) => /^\.(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const user = textoLimpio.split(/\s+/)[1].replace(/^@/, '');
        
        await sock.sendMessage(remitente, { text: `🔍 Buscando a *@${user}*...` }, { quoted: msg });

        try {
            const data = await igstalk(user);
            
            const informe = `👤 *PERFIL DE INSTAGRAM*\n\n` +
                `✨ *Nombre:* ${data.fullname || 'No definido'}\n` +
                `🆔 *User:* @${data.username}\n` +
                `📝 *Bio:* ${data.bio || 'Sin biografía'}\n\n` +
                `📊 *ESTADÍSTICAS*\n` +
                `🔹 *Seguidores:* ${data.followers}\n` +
                `🔸 *Seguidos:* ${data.following}\n` +
                `🖼️ *Posts:* ${data.post}\n\n` +
                `🔗 *Link:* https://instagram.com/${data.username}`;

            await sock.sendMessage(remitente, { 
                image: { url: data.profile }, 
                caption: informe 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en igstalk:', e);
            await sock.sendMessage(remitente, { 
                text: `❌ *Error:* No se pudo encontrar al usuario. Es posible que la cuenta sea privada o el nombre sea incorrecto.` 
            }, { quoted: msg });
        }
    }
};

async function igstalk(Username) {
    try {
        const { data } = await axios.get(`https://dumpor.com/v/${Username}`, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        
        // Extracción optimizada
        const profileRaw = $('.user__img').attr('style') || '';
        const profile = profileRaw.match(/url\(['"]?(.*?)['"]?\)/)?.[1] || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        return {
            profile,
            fullname: $('.user__title h1').text().trim(),
            username: $('.user__title h4').text().trim().replace('@', ''),
            post: $('.list-inline-item:contains("Posts")').text().replace(/[^\d.KM]/g, '').trim() || '0',
            followers: $('.list-inline-item:contains("Followers")').text().replace(/[^\d.KM]/g, '').trim() || '0',
            following: $('.list-inline-item:contains("Following")').text().replace(/[^\d.KM]/g, '').trim() || '0',
            bio: $('.user__info-desc').text().trim()
        };
    } catch (err) {
        throw new Error('Usuario no encontrado');
    }
}
