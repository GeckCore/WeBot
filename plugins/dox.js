import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

export default {
    name: 'simulador_rastreo_botones',
    match: (text) => /^\.dox\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo diseñado exclusivamente para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Requiere un objetivo. Uso: .dox @usuario" });

        try {
            // 1. Destrucción de la evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const numeroLimpio = "+" + mentionedJid.split('@')[0];

            // 2. Lógica de región psicológica (España, México, Argentina, etc.)
            let pais = "INTERNACIONAL";
            if (numeroLimpio.startsWith("+34")) pais = "ESPAÑA";
            else if (numeroLimpio.startsWith("+52")) pais = "MÉXICO";
            else if (numeroLimpio.startsWith("+54")) pais = "ARGENTINA";

            const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            const mac = "00:1B:44:11:3A:B7".replace(/[0-9B]/g, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]);

            // 3. Descarga e inyección de imagen de Radar Satelital para la cabecera
            let mediaObj = {};
            try {
                // Usamos una imagen de radar genérica para la estética hacker
                const res = await fetch("https://i.imgur.com/k6rZc2U.jpeg");
                if (res.ok) {
                    const buffer = Buffer.from(await res.arrayBuffer());
                    const media = await prepareWAMessageMedia({ image: buffer }, { upload: sock.waUploadToServer });
                    mediaObj = media.imageMessage;
                }
            } catch (e) {
                console.error("Fallo al cargar la imagen del radar, se enviará sin imagen.");
            }

            // 4. Construcción del Payload de Botones Interactivos
            const interactiveMessage = {
                body: { 
                    text: `*INFORME DE VULNERABILIDAD*\n\nObjetivo: ${numeroLimpio}\nRegión: ${pais}\nIPv4: ${ip}\nMAC: ${mac}\n\n⚠️ *Estado:* CONEXIÓN INTERCEPTADA.` 
                },
                footer: { text: "Protocolo de Rastreo Global" },
                header: { 
                    title: "🔴 *RASTREO SATELITAL COMPLETADO*", 
                    hasMediaAttachment: !!mediaObj,
                    ...(mediaObj && { imageMessage: mediaObj }) // Si se subió la imagen, la ancla aquí
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "cta_url",
                            buttonParamsJson: JSON.stringify({
                                display_text: "📍 Ver Coordenadas en Vivo",
                                // EXPLOIT ZERO-KNOWLEDGE:
                                // Esta es la API oficial de Google Maps. Al no pasarle una 'query', 
                                // obliga a la app nativa a centrarse instantáneamente en el GPS del dispositivo.
                                url: "https://www.google.com/maps/@?api=1&map_action=map", 
                                merchant_url: "https://www.google.com/maps"
                            })
                        }
                    ]
                }
            };

            // 5. Encapsulamiento ViewOnce para bypassear la restricción de cuentas Business
            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: interactiveMessage
                    }
                }
            }, { quoted: msg });

            // 6. Inyección de Mención para notificar a la víctima
            waMsg.message.viewOnceMessage.message.interactiveMessage.contextInfo = {
                mentionedJid: [mentionedJid],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363123456789012@newsletter",
                    newsletterName: "TERMINAL ROOT 👁️",
                    serverMessageId: -1
                }
            };

            // 7. Ejecución
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Dox V3:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla en la estructura de UI: ${err.message}` });
        }
    }
};
