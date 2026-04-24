import axios from 'axios';

// Estado global para saber a quién estamos reflejando
global.espejosActivos = global.espejosActivos || {};

export default {
    name: 'clon_absoluto_v2',
    
    // El match detecta tu comando O intercepta si la víctima habla
    match: (text, ctx) => {
        if (global.espejosActivos && global.espejosActivos[ctx.remitente]) return true;
        return /^\.clon/i.test(text);
    },
    
    execute: async (ctx) => {
        const { sock, msg, remitente, textoLimpio, quoted } = ctx;
        global.espejosActivos = global.espejosActivos || {};

        // ==========================================
        // 1. MODO INTERCEPTOR (Devuelve TODO: Audio, Video, Foto)
        // ==========================================
        if (global.espejosActivos[remitente] && !/^\.clon/i.test(textoLimpio)) {
            if (msg.key.fromMe) return; // Evita bucle infinito contigo mismo

            try {
                await sock.sendPresenceUpdate('recording', remitente);
                await new Promise(r => setTimeout(r, 1200)); // Delay humano

                // Clonamos la estructura completa del mensaje en bruto
                let contenido = JSON.parse(JSON.stringify(msg.message));
                let msgType = Object.keys(contenido)[0];

                // Borramos los metadatos que generan la etiqueta "Reenviado"
                if (contenido[msgType]?.contextInfo) {
                    delete contenido[msgType].contextInfo.isForwarded;
                    delete contenido[msgType].contextInfo.forwardingScore;
                }

                // Generamos un ID falso para engañar al sistema de deduplicación
                const nuevoId = '3EB0' + Math.random().toString(36).toUpperCase().substring(0, 18);
                
                // Reenviamos el payload puro (soporta cualquier formato nativo)
                await sock.relayMessage(remitente, contenido, { messageId: nuevoId });
                
                await sock.sendPresenceUpdate('paused', remitente);
            } catch (e) {
                console.error("Error al devolver multimedia:", e);
            }
            return; // Cortamos ejecución
        }

        // ==========================================
        // 2. LÓGICA DE ACTIVACIÓN (SOLO POR TI)
        // ==========================================
        
        let objetivo = null;
        if (quoted) {
            objetivo = msg.message.extendedTextMessage.contextInfo.participant;
        } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            objetivo = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else {
            objetivo = remitente; // Uso directo en chat privado
        }

        // Toggle: Apagado
        if (global.espejosActivos[objetivo]) {
            delete global.espejosActivos[objetivo];
            return sock.sendMessage(remitente, { text: "✅ Protocolo Espejo desactivado." });
        }

        // Encendido y Extracción
        try {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            let estadoText = "Hey there! I am using WhatsApp.";
            try {
                const info = await sock.fetchStatus(objetivo);
                if (info && info.status) estadoText = info.status;
            } catch (e) {
                console.log("Estado privado. Usando default.");
            }

            let bufferFp = null;
            try {
                const ppUrl = await sock.profilePictureUrl(objetivo, 'image');
                if (ppUrl) {
                    const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                    bufferFp = Buffer.from(response.data);
                    await sock.updateProfilePicture(sock.user.id, bufferFp);
                }
            } catch (e) {
                console.log("Foto de perfil bloqueada por privacidad. Se omite el cambio visual.");
            }

            try { await sock.updateProfileStatus(estadoText); } catch (e) {}

            // Activamos el target
            global.espejosActivos[objetivo] = true;

            await sock.sendMessage(remitente, { 
                text: `✅ *CLONACIÓN ACTIVA*\n\nObjetivo fijado: ${objetivo.split('@')[0]}\nExtracción visual: ${bufferFp ? 'Exitosa' : 'Denegada (Privacidad)'}\n\n_Todos los audios, stickers y mensajes serán reflejados automáticamente._` 
            });

        } catch (err) {
            console.error("Falla crítica en clonación:", err);
        }
    }
};
