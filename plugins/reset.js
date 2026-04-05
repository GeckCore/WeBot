// plugins/reset.js
module.exports = {
    name: 'reset',
    match: (text) => text.toLowerCase() === '!reset',
    execute: async ({ sock, remitente }) => {
        await sock.sendMessage(remitente, { text: "♻️ Contexto temporal borrado." });
    }
};
