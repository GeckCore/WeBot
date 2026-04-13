import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export default {
    name: 'audio_saturado',
    // Captura .saturar, .saturado o .loud
    match: (text) => /^\.(saturar|saturado|loud)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        // 1. Validar contenido multimedia
        const q = quoted || msg.message;
        const audioMsg = q?.audioMessage || q?.videoMessage || q?.viewOnceMessage?.message?.audioMessage || q?.viewOnceMessageV2?.message?.audioMessage;

        if (!audioMsg) {
            return sock.sendMessage(remitente, { text: '⚠️ Responde a un audio o video para saturarlo al límite.' }, { quoted: msg });
        }

        const timestamp = Date.now();
        const tempIn = path.join(process.cwd(), `temp_in_${timestamp}`);
        const tempOut = path.join(process.cwd(), `temp_out_${timestamp}.ogg`);
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '😤 *REVENTANDO EL AUDIO...* ⚠️' }, { quoted: msg });

            // 2. Descargar
            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // 3. FFMPEG: Filtros de saturación EXTREMA
            // bass=g=30: Hace que el audio retumbe físicamente.
            // treble=g=20: Realza los agudos para que la voz no se pierda en el ruido.
            // acrusher: Añade distorsión digital (bitcrush) para ese sonido "roto".
            // volume=40dB: Ganancia masiva para forzar el clipping (saturación).
            // Quitamos el alimiter para permitir que la onda se cuadre (distorsión real).
            const filters = "bass=g=30,treble=g=20,acrusher=level_in=1:level_out=1:bits=8:mode=log:aa=1,volume=40dB";
            
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -b:a 32k -vbr on "${tempOut}"`;
            
            await execPromise(cmd, { timeout: 45000 });

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("Fallo en la generación del archivo saturado.");
            }

            // 4. Enviar como nota de voz
            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            await sock.sendMessage(remitente, { text: `❌ Error: ${e.message.includes('timeout') ? 'Audio demasiado largo.' : 'No se pudo saturar el archivo.'}` });
        } finally {
            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        }
    }
};
