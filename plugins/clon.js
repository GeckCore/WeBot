import axios from 'axios';

// Creamos un registro global para saber a quién estamos clonando
global.espejosActivos = global.espejosActivos || {};

export default {
    name: 'clon_absoluto',
    match: (text) => /^\.clon/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        // Toggle: Si ya está activo, lo apagamos
        if (global.espejosActivos[remitente]) {
            delete global.espejosActivos[remitente];
            return sock.sendMessage(remitente, { text: "✅ Protocolo Espejo desactivado. (Nota: Tu perfil no vuelve a la normalidad automáticamente, debes cambiarlo tú)." });
        }

        try {
            // Sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            await sock.sendMessage(remitente, { text: "🔄 Extrayendo metadatos del objetivo..." });

            // 1. Extraer Status (Info)
            const info = await sock.fetchStatus(remitente).catch(() => ({ status: "Hey there! I am using WhatsApp." }));
            
            // 2. Extraer Nombre
            const nombreVictima = msg.pushName || "Usuario";

            // 3. Extraer y aplicar Foto de Perfil
            let ppUrl;
            try {
                ppUrl = await sock.profilePictureUrl(remitente, 'image');
                if (ppUrl) {
                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    await sock.updateProfilePicture(sock.user.id, Buffer.from(response.data));
                }
            } catch (e) {
                console.log("No se pudo obtener la foto de perfil (privacidad o sin foto).");
            }

            // 4. Aplicar Nombre e Info al Bot
            try { await sock.updateProfileName(nombreVictima); } catch(e) { console.log("Error al cambiar nombre"); }
            try { await sock.updateProfileStatus(info.status); } catch(e) { console.log("Error al cambiar info"); }

            // 5. Activar el Modo Espejo para este chat
            global.espejosActivos[remitente] = true;

            // 6. Mensaje de impacto
            await sock.sendMessage(remitente, {
                text: `⚠️ *ALERTA DE SEGURIDAD*\n\nSe ha detectado un inicio de sesión duplicado para este perfil.\n\n*Estado:* ${info.status}\n*Dispositivo clónico activado.*\n\n_Intercepción de mensajes activada._`,
            });

        } catch (err) {
            console.error("Falla crítica en clonación:", err);
            sock.sendMessage(remitente, { text: "❌ Error al ejecutar clonación. Revisa la consola." });
        }
    }
};
