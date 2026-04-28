// Asegúrate de tener cargada la librería 'fs'
const fs = require('fs');
const path = require('path');

// ... (dentro de tu función de ejecución)

// 1. Cargamos el logo desde la ruta correcta
const logoPath = path.join(__dirname, '../docs/media/logo.jpg');
const logoBuffer = fs.readFileSync(logoPath);

// 2. Definimos la URL de tu panel de control de forma clara
const controlPanelUrl = "https://geckcore.github.io/WeBot/";

// 3. ENVIAMOS EL MENSAJE REPARADO
await sock.sendMessage(remitente, {
    // Es vital enviar la URL en bruto como texto plano para asegurar la compatibilidad.
    text: `◢◤ *GECKCORE // HUB*\n\nAccede a la documentación y comandos en nuestra interfaz web oficial:\n${controlPanelUrl}`,
    mentions: [remitente],
    contextInfo: {
        externalAdReply: {
            title: "GECKCORE TACTICAL INTERFACE",
            body: "Click aquí para abrir el panel de control.",
            mediaType: 1, // Especificamos que es un anuncio
            thumbnail: logoBuffer, // Usamos la imagen cuadrada como miniatura
            sourceUrl: controlPanelUrl // Único enlace de origen táctil
            // He eliminado 'mediaUrl' para evitar conflictos
        }
    }
});
