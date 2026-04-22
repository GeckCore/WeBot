import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'factura_falsa',
    match: (text) => /^\.factura\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) return sock.sendMessage(remitente, { text: "❌ Ejecución denegada. Módulo diseñado solo para grupos." }, { quoted: msg });

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Faltan parámetros. Usa: .factura @user cantidad | concepto" });

        // Procesamiento del input
        const rawInput = textoLimpio.replace(/^\.factura\s+/i, '').replace(/@\d+/g, '').trim();
        
        let cantidad = "999.99$";
        let concepto = "Servicios nocturnos no especificados";

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) cantidad = parts[0];
        if (parts.length > 1 && parts[1]) concepto = parts[1];

        try {
            // 1. Borrado de evidencia
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Extracción de la foto de perfil de la víctima para hacer la factura más realista
            let pfpUrl;
            let thumbBuffer = Buffer.alloc(0);
            try {
                // Intentamos robar la URL de su foto de perfil
                pfpUrl = await sock.profilePictureUrl(mentionedJid, 'image');
                if (pfpUrl) {
                    const res = await fetch(pfpUrl);
                    const arrayBuffer = await res.arrayBuffer();
                    thumbBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e) {
                // Si la tiene oculta por privacidad, el buffer queda vacío y WhatsApp usa un ícono de caja por defecto
            }

            // 3. Falsificación del paquete de WhatsApp Business (orderMessage)
            const orderIdFake = Math.floor(Math.random() * 1000000000000000).toString();

            const waMsg = generateWAMessageFromContent(remitente, {
                orderMessage: {
                    orderId: orderIdFake,
                    thumbnail: thumbBuffer, // Incrustamos su propia foto en el recibo
                    itemCount: 1,
                    status: 1, // Estado de la orden (1 = Pendiente)
                    surface: 1,
                    message: `⚠️ DEUDA REGISTRADA EN EL SISTEMA\n\nTotal a pagar: ${cantidad}`,
                    orderTitle: concepto,
                    sellerJid: mentionedJid, // Falsificamos el emisor para que parezca su propio recibo
                    token: "ARBITRARY_TOKEN_BYPASS"
                }
            }, { quoted: msg });

            // 4. Inyección en el chat
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Invoice:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en la inyección de la interfaz comercial: ${err.message}` });
        }
    }
};
