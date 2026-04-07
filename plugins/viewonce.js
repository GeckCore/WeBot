const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // ── 1. Obtener el ID del mensaje citado ───────────────────────────
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const targetId    = contextInfo?.stanzaId;
        const targetJid   = contextInfo?.remoteJid || remitente;

        if (!targetId) {
            return sock.sendMessage(remitente, {
                text: '⚠️ *Uso:* Responde al mensaje efímero con `.ver`'
            }, { quoted: msg });
        }

        // ── 2. Búsqueda en tres capas ─────────────────────────────────────
        //   A) global.mediaCache  (RAM, mensajes de esta sesión + sesiones previas persistidas)
        //   B) global.store       (store en memoria de Baileys)
        //   C) contextInfo del propio mensaje citado (Baileys lo incluye a veces)
        let originalMsg =
            global.mediaCache?.get(targetId) ||
            global.store?.loadMessage(targetJid, targetId) ||
            global.store?.loadMessage(remitente, targetId) ||
            null;

        // Capa C: en ocasiones Baileys adjunta el mensaje citado directamente
        if (!originalMsg && contextInfo?.quotedMessage) {
            originalMsg = {
                key: { remoteJid: targetJid, id: targetId },
                message: contextInfo.quotedMessage,
            };
        }

        if (!originalMsg?.message) {
            return sock.sendMessage(remitente, {
                text: [
                    '❌ *No se encontró el mensaje.*',
                    '',
                    'Esto ocurre cuando:',
                    '• El mensaje fue enviado *antes* de que el bot arrancara y aún no había caché en disco.',
                    '• El mensaje fue purgado de la RAM (más de 1 500 mensajes en caché).',
                    '',
                    'El bot ahora guarda los mensajes en disco automáticamente. A partir del próximo reinicio este error no debería repetirse.',
                ].join('\n')
            }, { quoted: msg });
        }

        // ── 3. Desempaquetado agresivo de capas de cifrado ────────────────
        let content = originalMsg.message;
        let unwrapping = true;

        while (unwrapping) {
            if      (content?.ephemeralMessage)              content = content.ephemeralMessage.message;
            else if (content?.viewOnceMessage)               content = content.viewOnceMessage.message;
            else if (content?.viewOnceMessageV2)             content = content.viewOnceMessageV2.message;
            else if (content?.viewOnceMessageV2Extension)    content = content.viewOnceMessageV2Extension.message;
            else if (content?.documentWithCaptionMessage)    content = content.documentWithCaptionMessage.message;
            else if (content?.editedMessage)                 content = content.editedMessage.message;
            else unwrapping = false;
        }

        // ── 4. Detectar tipo de media ─────────────────────────────────────
        const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage'];
        const mediaTypeKey = Object.keys(content || {}).find(k => MEDIA_TYPES.includes(k));

        if (!mediaTypeKey) {
            console.error('[viewonce] Estructura no reconocida:', JSON.stringify(content, null, 2));
            return sock.sendMessage(remitente, {
                text: '❌ No se detectó imagen, video ni audio en el mensaje efímero.'
            }, { quoted: msg });
        }

        const mediaMsg  = content[mediaTypeKey];
        const mediaType = mediaTypeKey.replace('Message', ''); // 'image' | 'video' | 'audio'

        await sock.sendMessage(remitente, { text: '⏳ Desencriptando...' }, { quoted: msg });

        // ── 5. Descargar y reenviar ───────────────────────────────────────
        try {
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            const caption = '👁️ *Contenido revelado*';

            if      (mediaType === 'image') await sock.sendMessage(remitente, { image: buffer, caption }, { quoted: msg });
            else if (mediaType === 'video') await sock.sendMessage(remitente, { video: buffer, caption }, { quoted: msg });
            else if (mediaType === 'audio') await sock.sendMessage(remitente, { audio: buffer, ptt: !!mediaMsg.ptt }, { quoted: msg });

        } catch (err) {
            console.error('[viewonce] Error al descargar media:', err.message);
            await sock.sendMessage(remitente, {
                text: [
                    '❌ *No se pudo descargar el media.*',
                    '',
                    'Posible causa: la URL de descarga de WhatsApp ha expirado.',
                    'Las URLs del CDN de Meta caducan después de varias semanas.',
                    `Detalle técnico: \`${err.message}\``,
                ].join('\n')
            }, { quoted: msg });
        }
    }
};
