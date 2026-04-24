export default {
    name: 'identity_mirror',
    match: (text) => /^\.clon/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        try {
            // 1. Sigilo: Borramos el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Obtención de datos de la víctima
            const contacto = await sock.onWhatsApp(remitente);
            const info = await sock.fetchStatus(remitente).catch(() => ({ status: "Hey there! I am using WhatsApp." }));
            
            // Descargamos su foto de perfil
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(remitente, 'image');
            } catch (e) {
                ppUrl = null; // No tiene foto o está privada
            }

            // 3. Metamorfosis del Bot
            // Cambiamos el nombre del bot al nombre de la víctima
            // Nota: El nombre solo cambia para quienes no tengan el número guardado, 
            // pero la foto cambia para TODOS.
            if (ppUrl) {
                const response = await fetch(ppUrl);
                const buffer = await response.buffer();
                await sock.updateProfilePicture(sock.user.id, buffer);
            }

            // 4. El Mensaje Troll
            // Enviamos un mensaje que use su propia información contra él
            await sock.sendMessage(remitente, {
                text: `⚠️ *ALERTA DE SEGURIDAD*\n\nSe ha detectado un inicio de sesión duplicado para este perfil.\n\n*Estado:* ${info.status || 'Activo'}\n*IP:* 192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}\n\n_Si no has sido tú, cierra la aplicación inmediatamente._`,
                contextInfo: {
                    externalAdReply: {
                        title: "WHATSAPP CLONE DETECTED",
                        body: "Sincronizando base de datos...",
                        mediaType: 1,
                        thumbnailUrl: ppUrl,
                        sourceUrl: "https://www.whatsapp.com/security"
                    }
                }
            });

        } catch (err) {
            console.error("Error en Protocolo Espejo:", err);
        }
    }
};
