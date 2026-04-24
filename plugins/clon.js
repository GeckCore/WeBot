import axios from 'axios';

// Variable de estado aislada
global.espejosActivos = global.espejosActivos || {};

export default {
    name: 'clon_absoluto_vfinal',
    
    match: (text, ctx) => {
        // 1. Si TÚ escribes el comando explícito, entra.
        if (/^\.clon/i.test(text) && ctx.msg.key.fromMe) return true;
        
        // 2. Si el espejo está activo Y el mensaje es de la VÍCTIMA (no tuyo), entra.
        if (global.espejosActivos[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        
        // 3. Cualquier otra cosa (tus mensajes normales, comandos sin punto), se ignora.
        return false;
    },
    
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        global.espejosActivos = global.espejosActivos || {};

        // ==========================================
        // FASE 1: ACTIVACIÓN / DESACTIVACIÓN
        // ==========================================
        if (/^\.clon/i.test(textoLimpio) && msg.key.fromMe) {
            
            // Toggle de apagado
            if (global.espejosActivos[remitente]) {
                delete global.espejosActivos[remitente];
                return sock.sendMessage(remitente, { text: "✅ Protocolo Espejo desactivado." });
            }

            // Encendido
            try {
                // Borrar tu comando para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

                let estadoText = "Hey there! I am using WhatsApp.";
                try {
                    const info = await sock.fetchStatus(remitente);
                    if (info && info.status) estadoText = info.status;
                } catch (e) {}

                let bufferFp = null;
                try {
                    const ppUrl = await sock.profilePictureUrl(remitente, 'image');
                    if (ppUrl) {
                        const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                        bufferFp = Buffer.from(response.data);
                        await sock.updateProfilePicture(sock.user.id, bufferFp);
                    }
                } catch (e) {}

                try { await sock.updateProfileStatus(estadoText); } catch (e) {}

                global.espejosActivos[remitente] = true;
                await sock.sendMessage(remitente, { 
                    text: `✅ *CLONACIÓN ACTIVA*\n\nObjetivo fijado. Interceptando todo el tráfico de red de este chat.\n_Todo lo que envíe (foto, audio, texto) se le devolverá instantáneamente sin marca de reenviado._` 
                });
            } catch (err) {
                console.error("Falla en metadatos de clonación:", err);
            }
            return;
        }

        // ==========================================
        // FASE 2: CLONACIÓN DE TRÁFICO (MODO ESPEJO)
        // ==========================================
        try {
            // Simulamos interacción humana
            await sock.sendPresenceUpdate('recording', remitente);
            await new Promise(r => setTimeout(r, 1000));

            // Clonado de la estructura en crudo (Protobuf)
            let contenido = JSON.parse(JSON.stringify(msg.message));
            let msgType = Object.keys(contenido)[0];

            // Limpieza de metadatos de reenvío
            if (contenido[msgType]?.contextInfo) {
                delete contenido[msgType].contextInfo.isForwarded;
                delete contenido[msgType].contextInfo.forwardingScore;
            }

            // Engaño de deduplicación de Meta
            const nuevoId = '3EB0' + Math.random().toString(36).toUpperCase().substring(0, 18);
            
            // Reenvío nativo absoluto
            await sock.relayMessage(remitente, contenido, { messageId: nuevoId });
            await sock.sendPresenceUpdate('paused', remitente);
        } catch (e) {
            console.error("Error devolviendo el paquete:", e);
        }
    }
};
