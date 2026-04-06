const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
    name: 'igstalk',
    // Ahora acepta: .ig, .igstalk, ig, igstalk (con o sin punto)
    match: (text) => /^(\.)?(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // Extraer el usuario correctamente
        const args = textoLimpio.split(/\s+/);
        const user = args[1].replace(/^@/, '');
        
        console.log(`[PLUGIN] Ejecutando igstalk para: ${user}`);
        await sock.sendMessage(remitente, { text: `🔍 Buscando a *@${user}*...` }, { quoted: msg });

        try {
            // Usamos un mirror de Instagram más estable que Dumpor
            const data = await igstalk(user);
            
            const informe = `👤 *PERFIL DE INSTAGRAM*\n\n` +
                `✨ *Nombre:* ${data.fullname}\n` +
                `🆔 *User:* @${data.username}\n` +
                `📝 *Bio:* ${data.bio}\n\n` +
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
            console.error('Error en igstalk:', e.message);
            await sock.sendMessage(remitente, { 
                text: `❌ *Error:* No se encontró el perfil. Puede que sea privado o no exista.` 
            }, { quoted: msg });
        }
    }
};

async function igstalk(Username) {
    try {
        // Cambiamos a Imginn, que suele tener menos bloqueos de IP en VPS
        const { data } = await axios.get(`https://imginn.com/${Username}/`, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        
        return {
            profile: $('.info .img img').attr('src') || 'https://cdn-icons-png.flaticon.com/512/149/149071.png',
            fullname: $('.info .name').text().trim() || Username,
            username: Username,
            post: $('.info .stats li').eq(0).find('span').text().trim() || '0',
            followers: $('.info .stats li').eq(1).find('span').text().trim() || '0',
            following: $('.info .stats li').eq(2).find('span').text().trim() || '0',
            bio: $('.info .desc').text().trim() || 'Sin descripción'
        };
    } catch (err) {
        throw new Error('No se pudo acceder al perfil');
    }
}
