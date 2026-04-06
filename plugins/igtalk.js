const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'igstalk_hardened',
    match: (text) => /^(\.)?(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const user = textoLimpio.split(/\s+/)[1].replace(/^@/, '');
        const igCookiesPath = path.join(__dirname, '../instagram_cookies.txt');

        if (!fs.existsSync(igCookiesPath)) {
            return await sock.sendMessage(remitente, { text: '❌ Error: No se encuentra `instagram_cookies.txt`.' });
        }

        try {
            const cookieFile = fs.readFileSync(igCookiesPath, 'utf8');
            const cookieString = cookieFile.split('\n')
                .filter(line => line.trim() && !line.startsWith('#'))
                .map(line => {
                    const parts = line.split('\t');
                    return `${parts[5]}=${parts[6]}`;
                }).join('; ');

            const csrfToken = cookieString.match(/csrftoken=([^;]+)/)?.[1] || '';
            const ds_user_id = cookieString.match(/ds_user_id=([^;]+)/)?.[1] || '';

            // Petición con cabeceras de "Navegador Real" para evitar el 429
            const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${user}`, {
                headers: {
                    'cookie': cookieString,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'x-ig-app-id': '936619743392459',
                    'x-csrftoken': csrfToken,
                    'x-asbd-id': '129477', // ID de seguridad de la web de IG
                    'x-ig-www-claim': '0',
                    'x-requested-with': 'XMLHttpRequest',
                    'accept': '*/*',
                    'referer': `https://www.instagram.com/${user}/`,
                    'authority': 'www.instagram.com'
                }
            });

            const res = response.data.data.user;
            if (!res) throw new Error('NOT_FOUND');

            const iggs = `👤 *PERFIL:* @${res.username}\n` +
                `✨ *Nombre:* ${res.full_name}\n` +
                `📊 *Followers:* ${formatNumber(res.edge_followed_by.count)}\n` +
                `🔸 *Following:* ${formatNumber(res.edge_follow.count)}\n` +
                `🖼️ *Posts:* ${res.edge_owner_to_timeline_media.count}\n` +
                `📝 *Bio:* ${res.biography || 'N/A'}`;

            await sock.sendMessage(remitente, { 
                image: { url: res.profile_pic_url_hd }, 
                caption: iggs 
            }, { quoted: msg });

        } catch (e) {
            if (e.response?.status === 429) {
                return await sock.sendMessage(remitente, { 
                    text: '⚠️ *Límite excedido (429):* Instagram ha detectado demasiadas peticiones desde esta VPS. Espera 10-15 minutos antes de volver a intentar.' 
                }, { quoted: msg });
            }
            
            console.error('Error:', e.message);
            await sock.sendMessage(remitente, { text: `❌ Error: ${e.message}` }, { quoted: msg });
        }
    }
};

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}
