import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'estado_fantasma_universal',
    match: (text) => /^\.fakestatus\s*/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        
        // Buscamos el objetivo: 1. Mención, 2. Si es privado, el remitente, 3. Si no, error.
        let targetJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!targetJid && !isGroup) targetJid = remitente;

        if (!targetJid) {
            return sock.sendMessage(remitente, { text: "❌ Debes mencionar a alguien para usar esto en un grupo." }, { quoted: msg });
        }

        // Limpieza de texto para separar el Estado de la Respuesta
        const rawInput = textoLimpio.replace(/^\.fakestatus\s*/i, '').replace(/@\d+/g, '').trim();
        
        let textoEstado = "Pensando en lo que hice...";
        let tuRespuesta = "No puede ser, borra eso 💀";

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) textoEstado = parts[0];
        if (parts.length > 1 && parts[1]) tuRespuesta = parts[1];

        try {
            // Sigilo: borrar el comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // Obtención de foto de perfil (Thumb)
            let thumbBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
            try {
                const pfpUrl = await sock.profilePictureUrl(targetJid, 'image');
                if (pfpUrl) {
                    const res = await fetch(pfpUrl);
                    if (res.ok) thumbBuffer = Buffer.from(await res.arrayBuffer());
                }
            } catch (e) {}

            // Construcción del paquete de respuesta a Estado (status@broadcast)
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: tuRespuesta,
                    contextInfo: {
                        participant: targetJid,
                        remoteJid: "status@broadcast", 
                        stanzaId: "3EB0" + Date.now().toString(16).toUpperCase(), 
                        quotedMessage: {
                            imageMessage: {
                                jpegThumbnail: thumbBuffer,
                                caption: textoEstado 
                            }
                        }
                    }
                }
            }, { userJid: sock.user.id });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Status:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en el enrutamiento: ${err.message}` });
        }
    }
};
