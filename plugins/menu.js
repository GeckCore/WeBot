import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 🔴 Reconstrucción de __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'menu',
    match: (text) => /^[!/](menu|help|comandos)$/i.test(text),
    
    execute: async ({ sock, remitente, msg }) => {
        // 1. Cargamos el logo desde la ruta correcta
        const logoPath = path.join(__dirname, '../docs/media/logo.jpg');
        
        // Verificación de existencia
        if (!fs.existsSync(logoPath)) {
            console.error("❌ Error: No se encontró el logo en", logoPath);
            return sock.sendMessage(remitente, { text: "❌ Error de interfaz: Archivo gráfico no localizado." });
        }

        const logoBuffer = fs.readFileSync(logoPath);
        
        // 2. Definimos la URL de tu panel de control de forma clara
        const controlPanelUrl = "https://geckcore.github.io/WeBot/";

        // 3. ENVIAMOS EL MENSAJE
        await sock.sendMessage(remitente, {
            // El texto en bruto debajo asegura que cualquier móvil pueda clickarlo
            text: `◢◤ *GECKCORE // HUB*\n\nAccede a la documentación y comandos en nuestra interfaz web oficial:\n${controlPanelUrl}`,
            mentions: [remitente],
            contextInfo: {
                externalAdReply: {
                    title: "GECKCORE TACTICAL INTERFACE",
                    body: "Click aquí para abrir el panel de control.",
                    mediaType: 1, // Tipo 1 = Enlace enriquecido
                    renderLargerThumbnail: true, // Miniatura a tamaño completo
                    thumbnail: logoBuffer,
                    sourceUrl: controlPanelUrl 
                }
            }
        }, { quoted: msg });
    }
};
