const axios = require('axios');

module.exports = {
    name: 'igstalk_v3',
    match: (text) => /^(\.)?(igstalk|ig)\s+.+$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.split(/\s+/);
        const user = args[1].replace(/^@/, '');
        
        console.log(`[STALK] Consultando a: ${user}`);
        await sock.sendMessage(remitente, { text: `🔍 Consultando base de datos para *@${user}*...` }, { quoted: msg });

    try {
        // Usamos un endpoint de API alternativo que suele saltarse los bloqueos de VPS
        const res = await axios.get(`https://api.screenshotlayer.com/php_helper_ig.php?u=${user}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            },
            timeout: 10000 
        });

        const data = res.data;

        if (!data || !data.username) {
            throw new Error('NOT_FOUND');
        }

        const informe = `👤 *PERFIL DE INSTAGRAM*\n\n` +
            `✨ *Nombre:* ${data.full_name || data.username}\n` +
            `🆔 *User:* @${data.username}\n` +
            `📝 *Bio:* ${data.biography || 'Sin bio.'}\n\n` +
            `📊 *ESTADÍSTICAS*\n` +
            `🔹 *Seguidores:* ${formatNumber(data.follower_count)}\n` +
            `🔸 *Seguidos:* ${formatNumber(data.following_count)}\n` +
            `🖼️ *Posts:* ${data.media_count}\n\n` +
            `🔗 *Link:* https://instagram.com/${data.username}`;

        await sock.sendMessage(remitente, { 
            image: { url: data.profile_pic_url_hd || data.profile_pic_url }, 
            caption: informe 
        }, { quoted: msg });

    } catch (e) {
        console.error(`[IG-ERROR] Falló el stalk: ${e.message}`);
        
        let errorMsg = '❌ *Error:* El servidor de Instagram bloqueó la petición.';
        if (e.message === 'NOT_FOUND') errorMsg = '❌ *Error:* Perfil no encontrado o cuenta privada.';
        if (e.code === 'ECONNABORTED') errorMsg = '❌ *Error:* Tiempo de espera agotado (VPS lenta).';

        await sock.sendMessage(remitente, { text: errorMsg }, { quoted: msg });
    }
}
};

// Función para poner K o M en los números (Ej: 10.5K)
function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}
