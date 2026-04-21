import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

export default {
    name: 'menu_desplegable',
    match: (text) => /^\.menu$/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        try {
            console.log("[INFO] Construyendo menú desplegable para:", remitente);

            // Estructura purgada y universal. Sin parámetros experimentales.
            const listParams = {
                title: "Ver herramientas",
                sections: [
                    {
                        title: "Utilidades",
                        rows: [
                            { id: ".hd", title: "Mejorar calidad (HD)", description: "Upscaling de imagen con IA" },
                            { id: ".sg", title: "Sticker Glitch", description: "Exploit visual Chomp" }
                        ]
                    },
                    {
                        title: "Entretenimiento",
                        rows: [
                            { id: ".memes", title: "Shitpost (ES)", description: "Carrusel interactivo de Reddit" }
                        ]
                    }
                ]
            };

            const interactiveMessage = {
                header: {
                    title: "✦ TERMINAL PRINCIPAL ✦",
                    hasMediaAttachment: false
                },
                body: { text: "Selecciona un módulo del sistema para ejecutarlo." },
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

            const waMsg = generateWAMessageFromContent(remitente, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage
                    }
                }
            }, { userJid: sock.user.id, quoted: msg });

            await sock.relayMessage(remitente, waMsg.message, { messageId: waMsg.key.id });

        } catch (err) {
            console.error("Error Menú Interactivo:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo al renderizar: ${err.message}` });
        }
    }
};
