import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 🔴 Reconstrucción de __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'menu',
    match: (text) => /^\.(menu|help|comandos)$/i.test(text),
    
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

        const menuTexto = `◢◤ *GECKCORE // HUB*\n\nComandos base:\n• .menu\n• .sticker / .s\n• .fakequote @usuario texto|respuesta\n• .qc texto\n• .readqr\n• .play nombre\n• .ytmp3 enlace\n• .ytmp4 enlace\n• .grupo on/off`;

        await sock.sendMessage(remitente, {
            text: menuTexto
        }, { quoted: msg });

        // 3. ENVIAMOS ENLACE EN MENSAJE APARTE
        await sock.sendMessage(remitente, {
            text: `🔗 *Panel de control Web*\n${controlPanelUrl}`,
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
