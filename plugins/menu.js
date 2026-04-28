const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'menu',
    match: (text) => /^[!/](menu|help|comandos)$/i.test(text),
    
    execute: async ({ sock, remitente, msg }) => {
        const pluginsDir = path.join(__dirname, '../plugins');
        const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));

        let menuText = `◢◤ *GECKCORE // WEBOT OS* ◢◤\n`;
        menuText += `*────────────────────────*\n\n`;
        
        menuText += `*OPERADOR:* @${remitente.split('@')[0]}\n`;
        menuText += `*KERNEL:* v1.0.4-stable\n`;
        menuText += `*PLUGINS:* ${files.length} Modules Loaded\n`;
        menuText += `*UPTIME:* ${process.uptime().toFixed(0)}s\n\n`;

        menuText += `*🌐 INTERFAZ WEB:* \n`;
        menuText += `https://geckcore.github.io/WeBot/\n\n`;

        menuText += `*── [ PROTOCOLOS DE CONTROL ] ──*\n\n`;

        const descriptions = {
            // Comandos agresivos nuevos
            'shadow.js': 'Mimetismo de presencia y tracker de lectura.',
            'sniper.js': 'Sniper de escritura/audio (Dime?).',
            'centinela.js': 'Vigilancia de telemetría y logs de conexión.',
            'clon.js': 'Espejo absoluto de metadatos y perfil.',
            'inception.js': 'Bucle de citas anidadas infinitas.',
            'fake_quote.js': 'Generador de amnesia (Citas falsas).',
            'breach.js': 'Simulador de infiltración de sesión.',
            'trap.js': 'Deep Link Hijack (Secuestro de interfaz).',
            
            // Plugins estándar
            'downloads.js': 'Extracción de TikTok/IG vía Link.',
            'lyrics.js': 'Búsqueda de líricas (letra + texto).',
            'play.js': 'Download Engine de YouTube.',
            'remind.js': 'Scheduler de recordatorios tácticos.',
            'stats.js': 'Monitor de recursos (CPU/RAM/VPS).',
            'sticker.js': 'Conversor WebP de alta velocidad.',
            'tagall.js': 'Mención masiva (Admin Privileges).',
            'web_screenshot.js': 'Renderizado de sitios web (Screenshot).',
            'grupo.js': 'Control de permisos del Bot en grupos.'
        };

        files.forEach(file => {
            const cmdName = file.replace('.js', '');
            const desc = descriptions[file] || 'Módulo cargado sin descripción.';
            menuText += `█ *${cmdName.toUpperCase()}*\n`;
            menuText += `╰─ ${desc}\n\n`;
        });

        menuText += `*────────────────────────*\n`;
        menuText += `*GECKCORE SYSTEMS* | *2026*`;

        await sock.sendMessage(remitente, { 
            text: menuText,
            mentions: [remitente],
            contextInfo: {
                externalAdReply: {
                    title: "GECKCORE // WEBOT",
                    body: "Control & Intelligence Interface",
                    mediaType: 1,
                    thumbnailUrl: "https://geckcore.github.io/WeBot/assets/img/logo.png", // Asegúrate de que esta ruta exista en tu web
                    sourceUrl: "https://geckcore.github.io/WeBot/",
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });
    }
};
