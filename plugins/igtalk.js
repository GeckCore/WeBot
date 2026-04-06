const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Función para convertir el archivo .txt de cookies a un String útil
function parseCookies() {
    const cookiePath = path.join(__dirname, '../instagram_cookies.txt');
    if (!fs.existsSync(cookiePath)) return null;

    const content = fs.readFileSync(cookiePath, 'utf8');
    return content.split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const parts = line.split('\t');
            return `${parts[5]}=${parts[6]}`;
        }).join('; ');
}

module.exports = {
    name: 'igstalk_cookies',
    match: (text) => /^(\.)?(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const user = textoLimpio.split(/\s+/)[1].replace(/^@/, '');
        const cookies = parseCookies();

        if (!cookies) {
            return await sock.sendMessage(remitente, { text: '❌ Error: No encontré el archivo `instagram_cookies.txt` en la raíz.' });
        }

        await sock.sendMessage(remitente, { text: `🔍 Stalking con sesión activa para *@${user}*...` }, { quoted: msg });

        try {
            // Atacamos el endpoint oficial de perfil web
            const response = await axios.get(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${user}`, {
                headers: {
                    'Cookie': cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'x-ig-app-id': '936619743392459', // ID estándar de la App Web de IG
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                }
            });

            const data = response.data.data.user;

            if (!data) throw new Error('PRIVATE_OR_NOT_FOUND');

            const informe = `👤 *PERFIL DE INSTAGRAM (LOGGED IN)*\n\n` +
                `✨ *Nombre:* ${data.full_name}\n` +
                `🆔 *User:* @${data.username} ${data.is_verified ? '✅' : ''}\n` +
                `📝 *Bio:* ${data.biography || 'Sin bio'}\n` +
                `🔗 *Web:* ${data.external_url || 'No tiene'}\n\n` +
                `📊 *ESTADÍSTICAS*\n` +
                `🔹 *Seguidores:* ${formatNumber(data.edge_followed_by.count)}\n` +
                `🔸 *Seguidos:* ${formatNumber(data.edge_follow.count)}\n` +
                `🖼️ *Posts:* ${data.edge_owner_to_timeline_media.count}\n\n` +
                `🔐 *Privado:* ${data.is_private ? 'Sí' : 'No'}`;

            await sock.sendMessage(remitente, { 
                image: { url: data.profile_pic_url_hd }, 
                caption: informe 
            }, { quoted: msg });

        } catch (e) {
            console.error('[IG-COOKIES-ERROR]', e.response?.data || e.message);
            let errText = '❌ Error al obtener datos. Las cookies podrían haber expirado.';
            if (e.message === 'PRIVATE_OR_NOT_FOUND') errText = '❌ Perfil no encontrado o cuenta privada.';
            
            await sock.sendMessage(remitente, { text: errText }, { quoted: msg });
        }
    }
};

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}
