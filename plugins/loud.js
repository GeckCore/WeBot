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
        
        // 1. Detección dinámica y estricta de formato (Soporte para MP3 como documento)
        let mediaType = null;
        let mediaMsg = null;

        if (q?.audioMessage) { 
            mediaMsg = q.audioMessage; 
            mediaType = 'audio'; 
        } else if (q?.videoMessage) { 
            mediaMsg = q.videoMessage; 
            mediaType = 'video'; 
        } else if (q?.documentMessage && q.documentMessage.mimetype?.includes('audio')) { 
            // Soporte para canciones enviadas como archivo (.mp3)
            mediaMsg = q.documentMessage; 
            mediaType = 'document'; 
        } else if (q?.viewOnceMessage?.message?.audioMessage) { 
            mediaMsg = q.viewOnceMessage.message.audioMessage; 
            mediaType = 'audio'; 
        } else if (q?.viewOnceMessageV2?.message?.audioMessage) { 
            mediaMsg = q.viewOnceMessageV2.message.audioMessage; 
            mediaType = 'audio'; 
        }

        if (!mediaMsg) {
            return sock.sendMessage(remitente, { text: '⚠️ Responde a una nota de voz, video o canción (.mp3) para saturarlo.' }, { quoted: msg });
        }

        const timestamp = Date.now();
        const tempIn = path.join(__dirname, `../temp_in_${timestamp}`);
        const tempOut = path.join(__dirname, `../temp_out_${timestamp}.ogg`);
        const ffmpegPath = path.join(__dirname, '../ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '😤 *FORZANDO HARD CLIPPING...* ⚠️' }, { quoted: msg });

            // 2. Descarga usando el mediaType correcto (evita que se corrompa el buffer)
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío o corrupto en la descarga.");
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
                throw new Error("El procesamiento falló en FFmpeg.");
            }

            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            let msgError = "❌ Error al procesar.";
            if (e.message.includes('timeout')) msgError = "❌ La canción es demasiado pesada para procesarla en la VPS.";
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            setTimeout(() => {
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            }, 5000);
        }
    }
};
