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

            // NUEVO MÉTODO: SATURACIÓN SEGURA PARA MÓVILES
            // 1. treble=g=15 & bass=g=15: Potencian extremos para retener inteligibilidad de voz.
            // 2. volume=20dB: Ganancia alta (satura pero sin borrar la pista vocal entera).
            // 3. aformat=sample_fmts=s16: Hace el "corte" de la onda para el efecto shitpost.
            // 4. volume=0.6: CRÍTICO. Reduce el volumen final a un nivel seguro (60%) para que los 
            //    sistemas de protección de altavoces en móviles (Android/iOS) no bloqueen el audio.
            const filters = "treble=g=15,bass=g=15,volume=20dB,aformat=sample_fmts=s16,volume=0.6";
            
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
