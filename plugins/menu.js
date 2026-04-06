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
            'downloads.js': 'Extrae multimedia de TikTok/IG. (Pegar link)',
            'lyrics.js': 'Busca letras de canciones. (letra + texto)',
            'play.js': 'Descarga desde YouTube. (play + texto)',
            'remind.js': 'Agenda recordatorios. (remind + tiempo + texto)',
            'stats.js': 'Monitor de rendimiento VPS (CPU/RAM/Uptime).',
            'sticker.js': 'Genera stickers. (Responder "s" a imagen/video)',
            'sticker_converter.js': 'Sticker a imagen. (Responder "img" a sticker)',
            'tagall.js': 'Mención masiva en grupos. (!tagall)',
            'tomp3.js': 'Extrae audio de video. (Responder "mp3" a video)',
            'translate.js': 'Traductor rápido. (Responder "t" a mensaje)',
            'web_screenshot.js': 'Captura de pantalla web. (view + link)'
        };

        files.forEach(file => {
            const cmdName = file.replace('.js', '');
            const desc = descriptions[file] || 'Sin descripción técnica.';
            menuText += `◈ *${cmdName.toUpperCase()}*\n`;
            menuText += `╰─ ${desc}\n\n`;
        });

        menuText += `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n`;
        menuText += `*Node.js Engine v18.x* | *2026*`;

        await sock.sendMessage(remitente, { 
            text: menuText,
            mentions: [remitente]
        }, { quoted: msg });
    }
};
