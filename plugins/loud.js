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
            await sock.sendMessage(remitente, { text: '🎚️ *Saturando audio...* ⚠️' }, { quoted: msg });

            // 2. Descargar
            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // 3. FFMPEG: Filtros de saturación agresiva
            // bass=g=20: Retumba los bajos
            // treble=g=15: Satura los agudos para que la voz sea "entendible" entre el caos
            // volume=25dB: Fuerza la saturación digital
            // alimiter: Evita que el archivo se corrompa para que WhatsApp no lo bloquee
            const filters = "bass=g=20,treble=g=15,volume=25dB,alimiter=level_in=1:level_out=1:limit=0.8:attack=5:release=50";
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
