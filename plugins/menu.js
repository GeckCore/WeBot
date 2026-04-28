const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'menu',
    match: (text) => /^[!/](menu|help|comandos)$/i.test(text),
    
    execute: async ({ sock, remitente, msg }) => {
        // Ruta a tu logo cuadrado
        const logoPath = path.join(__dirname, '../docs/media/logo.jpg');
        
        // Verificación de existencia del archivo
        if (!fs.existsSync(logoPath)) {
            console.error("❌ Error: No se encontró el logo en docs/media/logo.jpg");
            return sock.sendMessage(remitente, { text: "❌ Error interno: Logo de marca no localizado." });
        }

        const logoBuffer = fs.readFileSync(logoPath);

        await sock.sendMessage(remitente, {
            image: logoBuffer,
            caption: `◢◤ *GECKCORE // HUB*\n\nAccede a la documentación y comandos en nuestra interfaz web oficial.`,
            contextInfo: {
                externalAdReply: {
                    title: "GECKCORE TACTICAL INTERFACE",
                    body: "Click aquí para abrir el panel de control.",
                    mediaType: 1,
                    renderLargerThumbnail: true, // Esto hace que la previsualización sea grande y destaque
                    thumbnail: logoBuffer,
                    sourceUrl: "https://geckcore.github.io/WeBot/",
                    mediaUrl: "https://geckcore.github.io/WeBot/"
                }
            }
        }, { quoted: msg });
    }
};
