import { downloadContentFromMessage } from '@whiskeysockets/baileys'

let handler = async (m, { conn }) => {
    if (!m.quoted) throw "⚠️ Responde al mensaje efímero con este comando."
    
    try {
        // En TheMystic, m.quoted suele traer el objeto de mensaje parseado
        let msg = m.quoted.message || m.quoted;
        
        // Desempaquetado seguro para cualquier variante de viewOnce de WhatsApp
        let isViewOnce = false;
        let content = msg;

        if (msg.viewOnceMessage) {
            content = msg.viewOnceMessage.message;
            isViewOnce = true;
        } else if (msg.viewOnceMessageV2) {
            content = msg.viewOnceMessageV2.message;
            isViewOnce = true;
        } else if (msg.viewOnceMessageV2Extension) {
            content = msg.viewOnceMessageV2Extension.message;
            isViewOnce = true;
        } else if (m.quoted.mtype === 'viewOnceMessageV2' || m.quoted.isViewOnce) {
            isViewOnce = true;
        }

        if (!isViewOnce) throw '❌ El mensaje citado no es un ViewOnce (Ver una vez).'
        if (!content) throw '❌ El mensaje está vacío (Probablemente purgado de la RAM del bot).'

        // Extraer el tipo de multimedia real
        let mediaTypeKey = Object.keys(content).find(k => k.includes('Message'));
        if (!mediaTypeKey) throw '❌ No se detectó imagen, video ni audio en la estructura.';

        let mediaMsg = content[mediaTypeKey];
        let type = mediaTypeKey.replace('Message', ''); // 'image', 'video', 'audio'

        // Descarga y desencriptación nativa
        let media = await downloadContentFromMessage(mediaMsg, type);
        let buffer = Buffer.from([]);
        
        for await (const chunk of media) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        // Envío del resultado
        if (type === 'video') {
            return conn.sendFile(m.chat, buffer, 'media.mp4', mediaMsg.caption || '👁️ Revelado', m);
        } else if (type === 'image') {
            return conn.sendFile(m.chat, buffer, 'media.jpg', mediaMsg.caption || '👁️ Revelado', m);
        } else if (type === 'audio') {
            return conn.sendFile(m.chat, buffer, 'audio.mp3', '', m, false, { ptt: !!mediaMsg.ptt });
        }

    } catch (e) {
        console.error('[viewonce-plugin] Error:', e);
        throw typeof e === 'string' ? e : `❌ Error técnico al desencriptar: ${e.message || 'La llave del mensaje caducó o fue purgada.'}`;
    }
}

handler.help = ['readvo'];
handler.tags = ['tools'];
handler.command = ['readviewonce', 'read', 'ver', 'readvo'];

export default handler;
