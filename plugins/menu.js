const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'menu',
    match: (text) => /^[!/](menu|help|comandos)$/i.test(text),
    
    execute: async ({ sock, remitente, msg }) => {
        const pluginsDir = path.join(__dirname, '../plugins');
        const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));

        let menuText = `┏━━━━━━━━━━━━━━━━━━┓\n`;
        menuText += `┃    *SYSTEM OPERATIVE* ┃\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━━┛\n\n`;
        menuText += `*User:* @${remitente.split('@')[0]}\n`;
        menuText += `*Plugins:* ${files.length} cargados\n`;
        menuText += `*Status:* Online\n\n`;
        menuText += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n`;

        // Mapeo manual de descripciones para que sea objetivo
        const descriptions = {
            'downloads.js': 'Descarga videos de TikTok e Instagram.',
            'lyrics.js': 'Busca letras de canciones.',
            'play.js': 'Descarga audio/video de YouTube.',
            'remind.js': 'Agenda recordatorios temporales.',
            'reset.js': 'Reinicia los contadores del sistema.',
            'save.js': 'Guarda notas o snippets en la nube local.',
            'stats.js': 'Muestra el rendimiento de la VPS (CPU/RAM).',
            'sticker.js': 'Convierte imágenes en stickers.',
            'sticker_converter.js': 'Pasa stickers estáticos a imagen.',
            'tagall.js': 'Menciona a todos los miembros del grupo.',
            'tomp3.js': 'Convierte videos en audios MP3.',
            'translate.js': 'Traductor multi-idioma ultra rápido.',
            'update.js': 'Actualiza los plugins desde el repositorio.',
            'web_screenshot.js': 'Captura una web (view + link).'
        };

        files.forEach(file => {
            const cmdName = file.replace('.js', '');
            const desc = descriptions[file] || 'Sin descripción técnica.';
            menuText += `◈ *${cmdName.toUpperCase()}*\n`;
            menuText += `╰─ ${desc}\n\n`;
        });

        menuText += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n`;
        menuText += `*Node.js Engine v18.x* | *2026*`;

        await sock.sendMessage(remitente, { 
            text: menuText,
            mentions: [remitente]
        }, { quoted: msg });
    }
};
