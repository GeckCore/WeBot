import Jimp from 'jimp';

export default {
    name: 'mejorar_hd',
    match: (text) => /^\.(hd|remini|upscale|enhance)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        // 1. Detección profunda de la imagen
        const q = quoted || msg.message;
        
        const findImageNode = (obj) => {
            if (!obj) return null;
            if (obj.imageMessage) return obj.imageMessage;
            if (obj.viewOnceMessage?.message?.imageMessage) return obj.viewOnceMessage.message.imageMessage;
            if (obj.viewOnceMessageV2?.message?.imageMessage) return obj.viewOnceMessageV2.message.imageMessage;
            return null;
        };

        const imageNode = findImageNode(q);
        
        if (!imageNode) {
            return sock.sendMessage(remitente, { text: '⚠️ *Uso:* Debes responder a una imagen con el comando `.hd`' }, { quoted: msg });
        }

        const mime = imageNode.mimetype || "";
        if (!/image\/(jpe?g|png)/.test(mime)) {
            return sock.sendMessage(remitente, { text: `❌ Formato (${mime}) no compatible. Solo JPG o PNG.` }, { quoted: msg });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: '⏳ *Procesando en local...*' }, { quoted: msg });

        try {
            // 2. Descargar la imagen de los servidores de WhatsApp
            const stream = await downloadContentFromMessage(imageNode, 'image');
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);

            if (buffer.length === 0) throw new Error("Fallo al descargar la imagen original.");

            // 3. Procesamiento 100% Local con Jimp (Cero APIs externas)
            const image = await Jimp.read(buffer);

            // Escalado Bicúbico x2, aumento de contraste sutil y normalización de color
            image.scale(2, Jimp.RESIZE_BICUBIC);
            image.contrast(0.1); 
            image.normalize();

            // Exportar a Buffer JPEG con alta calidad
            const hdBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

            // 4. Enviar resultado evadiendo el crasheo interno de Sharp
            await sock.sendMessage(remitente, { 
                image: hdBuffer, 
                caption: '✨ *Calidad mejorada (Local)*',
                // FIX CRÍTICO: Esto evita que Baileys llame a sharp internamente
                thumbnail: Buffer.alloc(0) 
            }, { quoted: msg });
            
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error('[PLUGIN HD] Error Local:', e);
            await sock.sendMessage(remitente, { text: `❌ *Error de procesamiento:*\n${e.message}` }, { edit: statusMsg.key });
        }
    }
};
