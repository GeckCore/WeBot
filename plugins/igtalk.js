const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'igstalk_cookies_fix',
    match: (text) => /^(\.)?(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const user = textoLimpio.split(/\s+/)[1].replace(/^@/, '');
        
        // Usamos la misma lógica de ruta que en tu comando de descargas
        const igCookiesPath = path.join(__dirname, '../instagram_cookies.txt');

        if (!fs.existsSync(igCookiesPath)) {
            return await sock.sendMessage(remitente, { text: '❌ Error: No se encuentra el archivo `instagram_cookies.txt` en la raíz.' });
        }

        await sock.sendMessage(remitente, { text: `🔍 Stalkeando a *@${user}* con cookies...` }, { quoted: msg });

        try {
            // Leer y procesar el archivo de cookies (formato Netscape)
            const cookieFile = fs.readFileSync(igCookiesPath, 'utf8');
            const cookieString = cookieFile.split('\n')
                .filter(line => line.trim() && !line.startsWith('#'))
                .map(line => {
                    const parts = line.split('\t');
                    return `${parts[5]}=${parts[6]}`;
                }).join('; ');

            // Extraer el CSRF Token de las cookies para la cabecera obligatoria
            const csrfToken = cookieString.match(/csrftoken=([^;]+)/)?.[1] || '';

            const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${user}`, {
                headers: {
                    'cookie': cookieString,
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'x-ig-app-id': '936619743392459', // ID de la aplicación web
                    'x-csrftoken': csrfToken,
                    'x-requested-with': 'XMLHttpRequest',
                    'referer': `https://www.instagram.com/${user}/`
                }
            });

            const res = response.data.data.user;

            if (!res) {
                return await sock.sendMessage(remitente, { text: '❌ No se encontró información. Perfil privado o cookies inválidas.' });
            }

            const iggs = `👤 *STALK: @${res.username}*\n\n` +
                `✨ *Nombre:* ${res.full_name}\n` +
                `🆔 *ID:* ${res.id}\n` +
                `📊 *Seguidores:* ${formatNumber(res.edge_followed_by.count)}\n` +
                `🔸 *Seguidos:* ${formatNumber(res.edge_follow.count)}\n` +
                `🖼️ *Posts:* ${res.edge_owner_to_timeline_media.count}\n\n` +
                `🔐 *Cuenta:* ${res.is_private ? 'Privada 🔒' : 'Pública 🔓'}\n` +
                `📝 *Bio:* ${res.biography || 'Sin descripción.'}\n` +
                `🔗 *Link:* ${res.external_url || 'No tiene'}`;

            await sock.sendMessage(remitente, { 
                image: { url: res.profile_pic_url_hd }, 
                caption: iggs 
            }, { quoted: msg });

        } catch (e) {
            console.error('Error en igstalk:', e.message);
            const errorLog = e.response?.data?.message || e.message;
            await sock.sendMessage(remitente, { 
                text: `❌ Error técnico:\n${errorLog.substring(0, 100)}` 
            }, { quoted: msg });
        }
    }
};

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}
