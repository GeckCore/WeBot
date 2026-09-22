// plugins/reset.js
module.exports = {
    name: 'reset',
    match: (text) => /^\.reset$/i.test((text || '').trim()),
    execute: async ({ sock, remitente }) => {
        await sock.sendMessage(remitente, { text: "♻️ Contexto temporal borrado." });
    }
};
