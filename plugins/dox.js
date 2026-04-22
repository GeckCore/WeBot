import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'simulador_rastreo',
    match: (text) => /^\.dox\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Módulo diseñado exclusivamente para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Requiere un objetivo. Uso: .dox @usuario" });

        try {
            // Destrucción de evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const numeroLimpio = "+" + mentionedJid.split('@')[0];

            let lat, lon, pais;
            if (numeroLimpio.startsWith("+34")) {
                lat = 40.4168 + (Math.random() * 6 - 3); 
                lon = -3.7038 + (Math.random() * 6 - 3);
                pais = "ESPAÑA";
            } else if (numeroLimpio.startsWith("+52")) {
                lat = 23.6345 + (Math.random() * 6 - 3);
                lon = -102.5528 + (Math.random() * 6 - 3);
                pais = "MÉXICO";
            } else if (numeroLimpio.startsWith("+54")) {
                lat = -38.4161 + (Math.random() * 6 - 3);
                lon = -63.6167 + (Math.random() * 6 - 3);
                pais = "ARGENTINA";
            } else {
                lat = 27.8143 + (Math.random() * 20 - 10);
                lon = -15.4443 + (Math.random() * 20 - 10);
                pais = "INTERNACIONAL";
            }

            const ip = `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            const mac = "00:1B:44:11:3A:B7".replace(/[0-9B]/g, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]);
            
            const waMsg = generateWAMessageFromContent(remitente, {
                locationMessage: {
                    // Estas coordenadas son falsas y solo sirven para dibujar el mapa genérico en la previsualización del chat
                    degreesLatitude: lat,
                    degreesLongitude: lon,
                    name: "🔴 [ RASTREO SATELITAL EN TIEMPO REAL ]",
                    address: `Objetivo: ${numeroLimpio}\nRegión: ${pais}\nIPv4: ${ip}\nMAC: ${mac}\nEstado: DISPOSITIVO INTERVENIDO`,
                    // EXPLOIT PSICOLÓGICO: 
                    // Obliga a Google Maps a leer el GPS local de quien sea que pulse el enlace
                    url: "https://www.google.com/maps/search/My+Location/"
                }
            }, { quoted: msg });

            // Inyección del bypass de Canales (Newsletter) para darle peso oficial
            waMsg.message.locationMessage.contextInfo = {
                mentionedJid: [mentionedJid],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363123456789012@newsletter",
                    newsletterName: "TERMINAL ROOT 👁️",
                    serverMessageId: -1
                }
            };

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Dox Exploit:", err);
            await sock.sendMessage(remitente, { text: `❌ Falla en la inyección: ${err.message}` });
        }
    }
};
