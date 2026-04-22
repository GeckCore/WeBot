import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'invitacion_falsa',
    match: (text) => /^\.fakegroup\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Ejecución denegada. Solo sirve en grupos." }, { quoted: msg });

        const rawInput = textoLimpio.replace(/^\.fakegroup\s+/i, '').trim();
        
        // Variables predeterminadas si el usuario no pone texto
        let groupName = "Comunidad VIP - Accesos Limitados";
        let desc = "Únete rápido. El enlace se autodestruirá en 5 minutos.";

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) groupName = parts[0];
        if (parts.length > 1 && parts[1]) desc = parts[1];

        try {
            // 1. Destrucción de evidencia en modo sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Fetch forzado de miniatura (Thumbnail)
            // Se usa una imagen genérica y abstracta (candado/servidor) para darle estética restrictiva
            let thumbBuffer = Buffer.alloc(0);
            try {
                const res = await fetch("https://i.imgur.com/L7X7H4z.jpeg"); 
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    thumbBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e) {}

            // 3. Falsificación del protocolo de Invitación
            const waMsg = generateWAMessageFromContent(remitente, {
                groupInviteMessage: {
                    groupJid: "1234567890-0987654321@g.us", // Estructura de JID válida pero matemáticamente inexistente
                    inviteCode: "EXPLOITBTPZ", // Código hash falso
                    inviteExpiration: Date.now() + (3 * 24 * 60 * 60 * 1000), // Fecha de caducidad falsa (3 días)
                    groupName: groupName,
                    jpegThumbnail: thumbBuffer,
                    caption: desc
                }
            }, { quoted: msg }); // Lo citamos al mensaje original para anclarlo en el chat

            // 4. Inyección en el flujo de datos
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Group:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en el renderizado de la UI: ${err.message}` });
        }
    }
};
