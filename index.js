const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- OPTIMIZACIÓN DE ARRANQUE: PERMISOS DE BINARIOS ---
// Hacemos esto fuera de la función principal para que se ejecute solo 1 vez al encender el bot
const binarios = ['yt-dlp', 'ffmpeg'];
binarios.forEach(bin => {
    const binPath = path.join(__dirname, bin);
    try {
        if (fs.existsSync(binPath)) {
            fs.chmodSync(binPath, '755');
            console.log(`[INFO] Permisos de ${bin} configurados correctamente.`);
        } else {
            console.log(`[ERROR] No se encuentra el archivo ${bin} en la raíz.`);
        }
    } catch (err) {
        console.error(`[ERROR] No se pudieron aplicar permisos a ${bin}:`, err.message);
    }
});

// Cargar plugins dinámicamente
const cargarPlugins = async () => {
    const pluginsDir = path.join(__dirname, 'plugins');
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    
    const pluginsCargados = [];

    for (const file of files) {
        try {
            const fullPath = path.join(pluginsDir, file);
            // Usamos import() dinámico con el prefijo file:// para que funcione en Windows/Linux
            // Esto permite cargar tanto tus plugins viejos (CJS) como el serbot nuevo (ESM)
            const module = await import('file://' + fullPath);
            
            // Si el plugin usa 'module.exports', estará en module.default o en el objeto raíz
            // Si el plugin usa 'export default', estará en module.default
            const plugin = module.default || module;
            
            pluginsCargados.push(plugin);
        } catch (err) {
            console.error(`❌ Error cargando plugin ${file}:`, err.message);
        }
    }
    return pluginsCargados;
};
        // Bucle de evaluación de plugins
        for (const plugin of plugins) {
            if (plugin.match(textoLimpio, ctx)) {
                try {
                    await plugin.execute(ctx);
                } catch (err) {
                    await sock.sendMessage(remitente, { text: `❌ Error interno (${plugin.name}): ${err.message}` });
                }
                break; 
            }
        }
    });
}

console.log("Iniciando motor modular...");
iniciarBot();
