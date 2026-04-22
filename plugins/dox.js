import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

export default {
    name: 'simulador_rastreo_v4',
    match: (text) => /^\.dox\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo solo para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona al objetivo: .dox @usuario" });

        try {
            const numeroLimpio = "+" + mentionedJid.split('@')[0];
            const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            
            // 1. Preparación de la imagen (Radar)
            let mediaObj = null;
            try {
                const res = await fetch("https://i.imgur.com/k6rZc2U.jpeg");
                if (res.ok) {
                    const buffer = Buffer.from(await res.arrayBuffer());
                    const prepared = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
                    mediaObj = prepared.imageMessage;
                }
            } catch (e) { console.error("Error cargando miniatura radar."); }

            // 2. Construcción del Mensaje Interactivo (Native Flow)
            const interactiveMessage = {
                body: { text: `*INFORME SATELITAL*\n\nObjetivo: ${numeroLimpio}\nIPv4: ${ip}\n\n⚠️ *Estado:* LOCALIZACIÓN INTERCEPTADA.` },
                footer: { text: "Terminal de Rastreo v4.0" },
                header: { 
                    title: "🔴 *CONEXIÓN ESTABLECIDA*", 
                    hasMediaAttachment: !!mediaObj,
                    ...(mediaObj && { imageMessage: mediaObj })
                },
                nativeFlowMessage: {
                    buttons: [{
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                            display_text: "📍 Abrir GPS en tiempo real",
                            url: "https://www.google.com/maps/@?api=1&map_action=map", 
                            merchant_url: "https://www.google.com/maps"
                        })
                    }]
                }
            };

            // 3. Generación del paquete con bypass de seguridad
            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: interactiveMessage
                    }
                }
            }, { 
                quoted: msg,
                userJid: sock.user.id 
            });

            // Inyectamos las menciones y el bypass de Newsletter
            waMsg.message.viewOnceMessage.message.interactiveMessage.contextInfo = {
                mentionedJid: [mentionedJid],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363123456789012@newsletter",
                    newsletterName: "TERMINAL ROOT 👁️",
                    serverMessageId: 1
                }
            };

            // 4. Envío por Relay (Inyección directa al protocolo)
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

            // 5. Borrado de evidencia (Solo si el envío fue exitoso)
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        } catch (err) {
            console.error("Error Dox V4:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en el relay de datos: ${err.message}` });
        }
    }
};
