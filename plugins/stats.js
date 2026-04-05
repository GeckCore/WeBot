// plugins/stats.js
const os = require('os');
module.exports = {
    name: 'stats',
    match: (text) => text.toLowerCase() === '!stats',
    execute: async ({ sock, remitente }) => {
        const freemem = (os.freemem() / (1024 * 1024)).toFixed(0);
        const totalmem = (os.totalmem() / (1024 * 1024)).toFixed(0);
        const uptime = (process.uptime() / 60 / 60).toFixed(2);
        await sock.sendMessage(remitente, { 
            text: `💻 *Estado del Servidor*\n\n🖥️ RAM Libre: ${freemem} MB / ${totalmem} MB\n⏱️ Uptime Bot: ${uptime} horas\n🧠 Plataforma: ${os.platform()} ${os.arch()}`
        });
    }
};
