import { generateWAMessageFromContent, prepareWAMessageMedia } from '@whiskeysockets/baileys';

export default {
    name: 'carrusel_oculto',
    match: (text) => /^\.ui$/i.test(text), // Comando: .ui
    execute: async ({ sock, remitente, msg }) => {
        
        const statusMsg = await sock.sendMessage(remitente, { text: "⏳ Construyendo interfaz interactiva..." }, { quoted: msg });

        try {
            // 1. Preparar las imágenes subiéndolas a los servidores de WhatsApp primero
            // Usamos imágenes de prueba ligeras para asegurar la carga rápida
            const img1 = await prepareWAMessageMedia({ image: { url: 'https://picsum.photos/id/10/400/300' } }, { upload: sock.waUploadToServer });
            const img2 = await prepareWAMessageMedia({ image: { url: 'https://picsum.photos/id/11/400/300' } }, { upload: sock.waUploadToServer });
            const img3 = await prepareWAMessageMedia({ image: { url: 'https://picsum.photos/id/12/400/300' } }, { upload: sock.waUploadToServer });

            // 2. Construir la estructura del Carrusel (InteractiveMessage)
            const interactiveMessage = {
                body: { text: "✦ *INTERFAZ EXPERIMENTAL* ✦\nDesliza hacia la izquierda para ver más." },
                footer: { text: "Generado por sistema Baileys" },
                carouselMessage: {
                    cards: [
                        {
                            header: { hasMediaAttachment: true, imageMessage: img1.imageMessage },
                            body: { text: "*Módulo 1*\nTexto de prueba para la primera tarjeta." },
                            nativeFlowMessage: { 
                                buttons: [
                                    { name: "quick_reply", buttonParamsJson: '{"display_text":"Acción 1","id":".ping"}' }
                                ] 
                            }
                        },
                        {
                            header: { hasMediaAttachment: true, imageMessage: img2.imageMessage },
                            body: { text: "*Módulo 2*\nSegunda tarjeta deslizable." },
                            nativeFlowMessage: { 
                                buttons: [
                                    { name: "quick_reply", buttonParamsJson: '{"display_text":"Acción 2","id":".menu"}' }
                                ] 
                            }
                        },
                        {
                            header: { hasMediaAttachment: true, imageMessage: img3.imageMessage },
                            body: { text: "*Módulo 3*\nTercera tarjeta." },
                            nativeFlowMessage: { 
                                // Botón de enlace (cta_url) en lugar de respuesta rápida
                                buttons: [
                                    { name: "cta_url", buttonParamsJson: '{"display_text":"Visitar Web","url":"https://google.com","merchant_url":"https://google.com"}' }
                                ] 
                            }
                        }
                    ],
                    messageVersion: 1
                }
            };

            // 3. Empaquetar el protocolo para forzar el renderizado
            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage
                    }
                }
            }, { quoted: msg });

            // 4. Enviar usando relay (transmisión cruda)
            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (err) {
            console.error("Error UI:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo crítico al compilar interfaz: ${err.message}` });
        }
    }
};
