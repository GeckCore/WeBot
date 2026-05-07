export default {
    name: 'instagram_stalk',
    match: (text) => /^\.igs\s+([a-zA-Z0-9._]+)$/i.test(text),
    
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // Extraemos el username del comando
        const username = textoLimpio.split(/\s+/)[1];
        const apiKey = "geckcore";
        const apiUrl = `https://api.yuki-wabot.my.id/stalking/instagram?username=${username}&apikey=${apiKey}`;

        try {
            // Indicador de carga
            await sock.sendMessage(remitente, { text: `🔍 *GECKCORE // BUSCANDO:* @${username}...` }, { quoted: msg });

            const response = await fetch(apiUrl);
            
            // Si la API falla o el usuario no existe
            if (!response.ok) throw new Error("Perfil no encontrado o API caída.");
            
            const data = await response.json();

            if (!data.status || !data.result) {
                return sock.sendMessage(remitente, { 
                    text: `❌ *ERROR:* No se pudo encontrar información para @${username}. Revisa si la cuenta es pública.` 
                });
            }

            const res = data.result;
            const info = `👤 *PERFIL DE INSTAGRAM*
            
• *Nombre:* ${res.full_name || 'No definido'}
• *Username:* @${res.username}
• *ID:* ${res.id}
• *Bio:* ${res.biography || 'Sin biografía.'}

📊 *ESTADÍSTICAS*
• *Seguidores:* ${res.followers.toLocaleString()}
• *Seguidos:* ${res.following.toLocaleString()}
• *Posts:* ${res.posts_count.toLocaleString()}

🔗 *Enlace:* https://instagram.com/${res.username}
${res.external_url ? `🌐 *Web:* ${res.external_url}` : ''}`;

            // Enviamos la foto de perfil con la info
            await sock.sendMessage(remitente, { 
                image: { url: res.profile_pic }, 
                caption: info 
            }, { quoted: msg });

        } catch (e) {
            console.error('[IG STALK ERROR]:', e);
            await sock.sendMessage(remitente, { 
                text: '❌ *ERROR CRÍTICO:* La API de Yuki no responde o el usuario no existe.' 
            });
        }
    }
};
