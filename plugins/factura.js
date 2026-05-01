import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'factura_falsa',
    match: (text) => /^\.factura\s+/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        

        const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentionedJid) return sock.sendMessage(remitente, { text: "❌ Faltan parámetros. Usa: .factura @user cantidad | concepto" });

        const rawInput = textoLimpio.replace(/^\.factura\s+/i, '').replace(/@\d+/g, '').trim();
        
        let cantidad = "999.99$";
        let concepto = "Servicios no especificados";

        const parts = rawInput.split('|').map(p => p.trim());
        if (parts.length > 0 && parts[0]) cantidad = parts[0];
        if (parts.length > 1 && parts[1]) concepto = parts[1];

        try {
            // 1. Borrado de evidencia en modo sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Fetch forzado de miniatura corporativa
            // Usamos un logo de advertencia bancaria genérico. Puedes cambiar esta URL por la que quieras.
            let thumbBuffer = Buffer.alloc(0);
            try {
                const res = await fetch("https://i.imgur.com/5OtbPDI.png"); // Sello rojo de advertencia/deuda
                if (res.ok) {
                    const arrayBuffer = await res.arrayBuffer();
                    thumbBuffer = Buffer.from(arrayBuffer);
                }
            } catch (e) {
                console.error("Fallo al descargar la miniatura de la factura.");
            }

            // 3. Falsificación del paquete (orderMessage)
            const orderIdFake = Math.floor(Math.random() * 1000000000000000).toString();

            const waMsg = generateWAMessageFromContent(remitente, {
                orderMessage: {
                    orderId: orderIdFake,
                    thumbnail: thumbBuffer, // Thumbnail forzado
                    itemCount: 1,
                    status: 1,
                    surface: 1,
                    message: `⚠️ AVISO DE COBRO PENDIENTE\n\nTotal a liquidar: ${cantidad}`,
                    orderTitle: concepto,
                    sellerJid: mentionedJid,
                    token: "ARBITRARY_TOKEN_BYPASS"
                }
            }, { quoted: msg });

            // 4. Inyección en el protocolo
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Fake Invoice:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo en la inyección de la interfaz comercial: ${err.message}` });
        }
    }
};
