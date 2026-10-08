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

        const menuTexto = `◢◤ *GECKCORE // HUB*\n\n*Comandos Base:*\n• .menu\n• .sticker / .s\n• .qc texto\n• .readqr\n• .play nombre\n• .ytmp3 enlace\n• .ytmp4 enlace\n• .grupo on/off\n\n*Simulaciones & Mensajes:*\n• .readmore texto1 | texto2 (Ocultar texto con Leer más)\n• .fakequote @user texto|reacción\n• .fakewa <texto> | [respuesta] (Citar a WhatsApp oficial)\n• .ghosttag [@user | mensaje] (Mención fantasma o tagall silencioso)\n• .fakestatus @user texto|respuesta\n• .fakeaudio @user [seg] | [respuesta]\n• .censurar [motivo] (citando mensaje)\n• .factura @user cantidad | concepto\n• h <texto> (fakemessage en vivo citando mensaje)\n• .grupos (Listar grupos vinculados)\n• .mensajes [número] (Ver mensajes del grupo)\n• .titiritero <número> | <texto> (Modificar mensaje ajeno en vivo)\n• .fake3 <número> | <falso> | [resp] (Inyectar cita falsa con ID real)`;

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
