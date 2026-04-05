// plugins/save.js
const fs = require('fs');
module.exports = {
    name: 'save',
    match: (text) => text.toLowerCase().includes('save'),
    execute: async ({ sock, remitente, textoLimpio, msg, quoted, msgType, getMediaInfo, downloadContentFromMessage }) => {
        let mediaToSave = null;
        let typeToSave = null;
        
        if (textoLimpio.toLowerCase() === 'save' && quoted) {
            const mediaInfo = getMediaInfo(quoted);
            if (mediaInfo) { mediaToSave = mediaInfo.msg; typeToSave = mediaInfo.type; }
        } else if (msgType) {
            const mediaInfo = getMediaInfo(msg.message);
            if (mediaInfo) { mediaToSave = mediaInfo.msg; typeToSave = mediaInfo.type; }
        }

        if (!mediaToSave) return;

        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Guardando en PC..." });
        const folder = './Recibidos';
        if (!fs.existsSync(folder)) fs.mkdirSync(folder);
        
        const extMap = { 'image': 'jpg', 'video': 'mp4', 'audio': 'ogg', 'document': 'bin' };
        const originalName = mediaToSave.fileName || `media_${Date.now()}.${extMap[typeToSave] || 'bin'}`;
        const finalPath = `${folder}/${originalName}`;

        const stream = await downloadContentFromMessage(mediaToSave, typeToSave);
        let buffer = Buffer.from([]);
        for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        fs.writeFileSync(finalPath, buffer);

        await sock.sendMessage(remitente, { text: `📁 Guardado: \`${finalPath}\``, edit: statusMsg.key });
    }
};
