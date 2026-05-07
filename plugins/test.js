export default {
    name: 'instagram_stalk_v4',
    match: (text) => /^\.ig\s+([a-zA-Z0-9._]+)$/i.test(text),
    
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const username = textoLimpio.split(/\s+/)[1];
        const apiKey = "geckcore";
        const apiUrl = `https://api.yuki-wabot.my.id/stalking/instagram?username=${username}&apikey=${apiKey}`;

        try {
            await sock.sendMessage(remitente, { text: `🔍 *GECKCORE // RASTREANDO:* @${username}...` }, { quoted: msg });

            const response = await fetch(apiUrl);
            const data = await response.json();

            // --- BLOQUE DEBUG ---
            // Mira la consola de tu bot para ver qué responde la API realmente
            console.log(`[IG DEBUG] Respuesta para ${username}:`, JSON.stringify(data, null, 2));
            // --------------------

            if (!data.status || !data.result || data.result.username === undefined) {
                // Si la API responde pero no trae datos, es que el scraper está "quemado"
                const errorMsg = data.message || "El servidor de la API no puede acceder a Instagram ahora mismo.";
                return sock.sendMessage(remitente, { 
                    text: `❌ *ERROR DE API:* ${errorMsg}\n\n> Lo más probable es que Instagram haya bloqueado temporalmente al bot de Yuki. Prueba con otro usuario o más tarde.` 
                });
            }

            const res = data.result;
            const info = `👤 *PERFIL DE INSTAGRAM*
            
• *Nombre:* ${res.full_name || 'No definido'}
• *Username:* @${res.username}
• *Bio:* ${res.biography || 'Sin biografía.'}

📊 *ESTADÍSTICAS*
• *Seguidores:* ${res.followers?.toLocaleString() || '0'}
• *Seguidos:* ${res.following?.toLocaleString() || '0'}
• *Posts:* ${res.posts_count?.toLocaleString() || '0'}

🔗 *Link:* https://instagram.com/${res.username}`;

            await sock.sendMessage(remitente, { 
                image: { url: res.profile_pic }, 
                caption: info 
            }, { quoted: msg });

        } catch (e) {
            console.error('[IG STALK CRITICAL]:', e);
            await sock.sendMessage(remitente, { 
                text: '❌ *ERROR CRÍTICO:* La API ha muerto o ha cambiado su estructura. Revisa la consola.' 
            });
        }
    }
};
