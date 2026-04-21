import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'menu_desplegable',
    match: (text) => /^\.menu$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        try {
            // Estructura del cajón desplegable (Bottom Sheet)
            const listParams = {
                title: "Desplegar herramientas",
                sections: [
                    {
                        title: "⚙️ UTILIDADES TÉCNICAS",
                        highlight_label: "Útil", // Etiqueta verde que llama la atención
                        rows: [
                            { id: ".hd", title: "Mejorar calidad (HD)", description: "Upscaling de imagen con VectorInk" },
                            { id: ".sg", title: "Sticker Glitch", description: "Corrompe una imagen/video con exploit Chomp" }
                        ]
                    },
                    {
                        title: "🦍 ENTRETENIMIENTO",
                        rows: [
                            { id: ".memes", title: "Shitpost (ES)", description: "Carrusel interactivo de Reddit" }
                        ]
                    }
                ]
            };

            // Construcción del mensaje interactivo
            const interactiveMessage = {
                header: {
                    title: "✦ *TERMINAL PRINCIPAL* ✦",
                    hasMediaAttachment: false
                },
                body: { text: "Selecciona un módulo del sistema para ejecutarlo instantáneamente." },
                footer: { text: "Sistema automatizado Baileys" },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify(listParams)
                        }
                    ],
                    messageVersion: 1
                }
            };

            // Empaquetado con el exploit ViewOnce
            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage
                    }
                }
            }, { quoted: msg });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Menú Interactivo:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo al renderizar interfaz: ${err.message}` });
        }
    }
};
