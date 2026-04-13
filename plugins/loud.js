import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    name: 'audio_saturado',
    // Captura .saturar, .saturado o .loud
    match: (text) => /^\.(saturar|saturado|loud)$/i.test(text),

    execute: async ({ sock, remitente, msg, quoted, downloadContentFromMessage }) => {
        const q = quoted || msg.message;
        const audioMsg = q?.audioMessage || q?.videoMessage || q?.viewOnceMessage?.message?.audioMessage || q?.viewOnceMessageV2?.message?.audioMessage;

        if (!audioMsg) {
            return sock.sendMessage(remitente, { text: '⚠️ Responde a un audio o video para saturarlo.' }, { quoted: msg });
        }

        const timestamp = Date.now();
        const tempIn = path.join(__dirname, `../temp_in_${timestamp}`);
        const tempOut = path.join(__dirname, `../temp_out_${timestamp}.ogg`);
        // Ruta corregida según tu estructura: ../ffmpeg relativo al plugin
        const ffmpegPath = path.join(__dirname, '../ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '😤 *REVENTANDO AUDIO...* ⚠️' }, { quoted: msg });

            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // FILTROS DE SATURACIÓN "ENTENDIBLE":
            // volume=30dB: Ganancia forzada para clipping digital.
            // bass=g=20: Potencia los bajos significativamente.
            // treble=g=15: Realza la voz para que no se pierda entre la saturación.
            // alimiter: Evita que el archivo se corrompa pero mantiene el sonido "cuadrado".
            const filters = "volume=30dB,bass=g=20,treble=g=15,alimiter=limit=0.9";
            
            // Bitrate de 32k para ligereza en la VPS y velocidad de proceso
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -b:a 32k -vbr on "${tempOut}"`;
            
            // Límites amplios para canciones largas
            await execPromise(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("El procesamiento falló.");
            }

            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            let msgError = "❌ Error al procesar.";
            if (e.message.includes('timeout')) msgError = "❌ Audio demasiado pesado para la VPS.";
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            // Limpieza diferida para asegurar que el archivo se envió
            setTimeout(() => {
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            }, 5000);
        }
    }
};
