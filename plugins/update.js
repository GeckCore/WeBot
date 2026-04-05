// plugins/update.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'update',
    match: (text) => text.toLowerCase() === '!update',
    execute: async ({ sock, remitente }) => {
        await sock.sendMessage(remitente, { text: "⏳ Sincronizando con GitHub..." });

        try {
            // 1. Descargar cambios del repositorio
            const { stdout, stderr } = await execPromise('git pull');
            
            if (stdout.includes('Already up to date.')) {
                return await sock.sendMessage(remitente, { text: "✅ El bot ya está actualizado con la última versión de GitHub." });
            }

            await sock.sendMessage(remitente, { text: "🚀 Cambios aplicados correctamente. Reiniciando el bot..." });

            // 2. Matar el proceso actual. Pterodactyl lo reinicia al instante.
            setTimeout(() => {
                process.exit(0);
            }, 1000);

        } catch (err) {
            let errorMsg = err.message;
            if (errorMsg.includes('Could not resolve host')) {
                errorMsg = "Error de red: No se pudo conectar a GitHub.";
            } else if (errorMsg.includes('Permission denied')) {
                errorMsg = "Error de permisos: Git no tiene acceso al repositorio.";
            }
            
            await sock.sendMessage(remitente, { text: `❌ Fallo al actualizar:\n\n${errorMsg.substring(0, 100)}` });
        }
    }
};
