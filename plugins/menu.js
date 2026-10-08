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

        const menuTexto = `◢◤ *GECKCORE // HUB*\n\n*Comandos Base:*\n• .menu\n• .sticker / .s\n• .qc texto\n• .readqr\n• .play nombre\n• .ytmp3 enlace\n• .ytmp4 enlace\n• .grupo on/off\n\n*Simulaciones & Mensajes:*\n• .fakequote @user texto|reacción\n• .fakestatus @user texto|respuesta\n• .fakeaudio @user [seg] | [respuesta]\n• .fakeleak @user [secreto] | [respuesta]\n• .fakepoll @user pregunta | op1,op2 | [respuesta]\n• .censurar [motivo] (citando mensaje)\n• .factura @user cantidad | concepto\n• h <texto> (fakemessage en vivo citando mensaje)`;

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
