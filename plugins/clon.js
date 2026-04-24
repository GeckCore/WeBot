import axios from 'axios';

global.espejosActivos = global.espejosActivos || {};

export default {
    name: 'clon_absoluto_v3',
    
    match: (text, ctx) => {
        // Intercepta si el espejo está activo para este chat o si envías el comando
        if (global.espejosActivos && global.espejosActivos[ctx.remitente]) return true;
        return /^\.clon/i.test(text);
    },
    
    execute: async (ctx) => {
        const { sock, msg, remitente, textoLimpio, quoted } = ctx;
        global.espejosActivos = global.espejosActivos || {};

        // ==========================================
        // 1. MODO INTERCEPTOR (Refleja multimedia y texto)
        // ==========================================
        if (global.espejosActivos[remitente] && !/^\.clon/i.test(textoLimpio)) {
            // Si el mensaje es tuyo, no lo reflejamos. Solo reflejamos lo de la víctima.
            if (msg.key.fromMe) return; 

            try {
                await sock.sendPresenceUpdate('recording', remitente);
                await new Promise(r => setTimeout(r, 1200)); 

                let contenido = JSON.parse(JSON.stringify(msg.message));
                let msgType = Object.keys(contenido)[0];

                if (contenido[msgType]?.contextInfo) {
                    delete contenido[msgType].contextInfo.isForwarded;
                    delete contenido[msgType].contextInfo.forwardingScore;
                }

                const nuevoId = '3EB0' + Math.random().toString(36).toUpperCase().substring(0, 18);
                
                await sock.relayMessage(remitente, contenido, { messageId: nuevoId });
                await sock.sendPresenceUpdate('paused', remitente);
            } catch (e) {
                console.error("Error al devolver multimedia:", e);
            }
            return; 
        }

        // ==========================================
        // 2. LÓGICA DE ACTIVACIÓN (Solo tú controlas esto)
        // ==========================================
        
        // Si no es un comando explícito, cortamos (evita que otros mensajes tuyos activen cosas raras)
        if (!/^\.clon/i.test(textoLimpio)) return;

        let objetivo = null;
        if (quoted) {
            objetivo = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            objetivo = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else {
            // Si lo usas en privado, el objetivo es la persona con la que hablas
            objetivo = remitente; 
        }

        // Toggle: Apagado
        if (global.espejosActivos[objetivo]) {
            delete global.espejosActivos[objetivo];
            return sock.sendMessage(remitente, { text: "✅ Protocolo Espejo desactivado." });
        }

        // Encendido
        try {
            // Sigilo (borra tu comando)
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            let estadoText = "Hey there! I am using WhatsApp.";
            try {
                const info = await sock.fetchStatus(objetivo);
                if (info && info.status) estadoText = info.status;
            } catch (e) {}

            let bufferFp = null;
            try {
                const ppUrl = await sock.profilePictureUrl(objetivo, 'image');
                if (ppUrl) {
                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    bufferFp = Buffer.from(response.data);
                    await sock.updateProfilePicture(sock.user.id, bufferFp);
                }
            } catch (e) {}

            try { await sock.updateProfileStatus(estadoText); } catch (e) {}

            global.espejosActivos[objetivo] = true;

            await sock.sendMessage(remitente, { 
                text: `✅ *CLONACIÓN ACTIVA*\n\nObjetivo fijado: ${objetivo.split('@')[0]}\nExtracción visual: ${bufferFp ? 'Exitosa' : 'Denegada (Privacidad)'}\n\n_El perfil ha sido duplicado y las respuestas automáticas están en línea._` 
            });

        } catch (err) {
            console.error("Falla crítica en clonación:", err);
        }
    }
};
