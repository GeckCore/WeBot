// plugins/update.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'update',
    match: (text) => text.toLowerCase() === '!update',
    execute: async ({ sock, remitente }) => {
        await sock.sendMessage(remitente, { text: "⏳ Sincronizando cambios desde GitHub..." });

        try {
            // 1. Ejecutar el pull
            const { stdout } = await execPromise('git pull');
            
            if (stdout.includes('Already up to date.')) {
                return await sock.sendMessage(remitente, { text: "✅ El bot ya está en la última versión." });
            }

            await sock.sendMessage(remitente, { text: "🚀 Cambios aplicados. Forzando reinicio automático..." });

            // 2. Delay breve para asegurar que el mensaje de arriba se envíe antes de morir
            setTimeout(() => {
                // Usamos exit(1) para que Pterodactyl detecte un "crash" y reinicie el contenedor
                process.exit(1); 
            }, 2000);

        } catch (err) {
            await sock.sendMessage(remitente, { text: `❌ Error en git pull: ${err.message.substring(0, 100)}` });
        }
    }
};
