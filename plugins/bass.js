import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export default {
    name: 'bass_boost',
    match: (text) => /^\.(bass|earrape)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        // 1. Validar que se está respondiendo a un contenido de audio o video
        const q = quoted || msg.message;
        const audioMsg = q?.audioMessage || q?.videoMessage || q?.viewOnceMessage?.message?.audioMessage || q?.viewOnceMessageV2?.message?.audioMessage;

        if (!audioMsg) {
            return sock.sendMessage(remitente, { text: '⚠️ Responde a una nota de voz, audio o video para reventarle los bajos.' }, { quoted: msg });
        }

        // 2. Definir rutas (usando el directorio raíz donde están los binarios)
        const timestamp = Date.now();
        const tempIn = path.join(process.cwd(), `temp_in_${timestamp}`);
        const tempOut = path.join(process.cwd(), `temp_out_${timestamp}.ogg`);
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '🔊 *Procesando Earrape...* 💥' }, { quoted: msg });

            // 3. Descargar el archivo
            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            if (buffer.length === 0) throw new Error("No se pudo descargar el audio.");
            fs.writeFileSync(tempIn, buffer);

            // 4. Ejecutar FFMPEG con filtros de distorsión y salida OPUS (Formato nativo de WA)
            // g=15 en bass es suficiente para que retumbe sin corromper el archivo.
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "bass=g=15,volume=2.5" -c:a libopus -b:a 32k -vbr on "${tempOut}"`;
            
            await execPromise(cmd, { timeout: 30000 }); // 30s timeout

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("El procesamiento de audio falló.");
            }

            // 5. Enviar como nota de voz (ptt: true) para que sea instantáneo
            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[BASS ERROR]:', e);
            await sock.sendMessage(remitente, { text: `❌ Error: ${e.message.includes('timeout') ? 'El audio es demasiado largo.' : 'No se pudo procesar el audio.'}` });
        } finally {
            // Limpieza de archivos temporales
            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        }
    }
};
