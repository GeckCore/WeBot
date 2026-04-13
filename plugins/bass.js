import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
const execPromise = util.promisify(exec);

export default {
    name: 'bass_boost',
    match: (text) => /^\.(bass|earrape)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        const q = quoted || msg.message;
        const audioMsg = q.audioMessage || q.videoMessage;

        if (!audioMsg) return sock.sendMessage(remitente, { text: '⚠️ Responde a un audio o video para reventarle los bajos.' });

        const tempIn = path.join(process.cwd(), `in_${Date.now()}.mp3`);
        const tempOut = path.join(process.cwd(), `out_${Date.now()}.mp3`);
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '🔊 *Aplicando distorsión masiva...*' }, { quoted: msg });

            const stream = await downloadContentFromMessage(audioMsg, audioMsg.mimetype.split('/')[0]);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(tempIn, buffer);

            // Filtro de ecualización extrema: aumenta bajos y añade distorsión de volumen
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "equalizer=f=40:width_type=h:w=50:g=20,bass=g=30,volume=5" "${tempOut}"`;
            
            await execPromise(cmd);

            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/mp4', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error(e);
            await sock.sendMessage(remitente, { text: '❌ Error al procesar el audio.' });
        } finally {
            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        }
    }
};
