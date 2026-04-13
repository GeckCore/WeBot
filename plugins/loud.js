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
        const ffmpegPath = path.join(__dirname, '../ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '😤 *FORZANDO HARD CLIPPING...* ⚠️' }, { quoted: msg });

            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // NUEVO MÉTODO: HARD CLIPPING MATEMÁTICO
            // 1. treble=g=15: Sube los agudos para proteger la inteligibilidad de la voz.
            // 2. bass=g=15: Sube los graves para el golpe.
            // 3. volume=40dB: Sube el volumen de forma absurda (rompe el límite).
            // 4. aformat=sample_fmts=s16: Obliga a FFmpeg a cortar de tajo todo lo que exceda el volumen máximo, creando distorsión cuadrada pura.
            const filters = "treble=g=15,bass=g=15,volume=40dB,aformat=sample_fmts=s16";
            
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -b:a 32k -vbr on "${tempOut}"`;
            
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
            setTimeout(() => {
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            }, 5000);
        }
    }
};
