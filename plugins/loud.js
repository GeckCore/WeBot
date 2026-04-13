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
        
        // 1. Detección dinámica de multimedia (Soporte para MP3 como documento)
        let mediaType = null;
        let mediaMsg = null;

        if (q?.audioMessage) { 
            mediaMsg = q.audioMessage; 
            mediaType = 'audio'; 
        } else if (q?.videoMessage) { 
            mediaMsg = q.videoMessage; 
            mediaType = 'video'; 
        } else if (q?.documentMessage && q.documentMessage.mimetype?.includes('audio')) { 
            mediaMsg = q.documentMessage; 
            mediaType = 'document'; 
        } else if (q?.viewOnceMessage?.message?.audioMessage || q?.viewOnceMessageV2?.message?.audioMessage) { 
            mediaMsg = q.viewOnceMessage?.message?.audioMessage || q.viewOnceMessageV2?.message?.audioMessage;
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
            await sock.sendMessage(remitente, { text: '😤 *REVENTANDO AUDIO...* (Válido para móvil y PC)' }, { quoted: msg });

            // 2. Descarga del contenido
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // 3. NUEVA TÉCNICA: COMPRESIÓN DE MURO (Shitpost Mobile-Native)
            // - volume=30dB: Ganancia masiva inicial.
            // - acompressor: Actúa como un muro. Aplasta el audio para que "grite" pero no se corrompa.
            // - ac 1: FORZADO A MONO. Los móviles fallan si el OGG es estéreo y muy saturado.
            // - ar 16000: Frecuencia de muestreo estándar de WhatsApp.
            // - application voip: Optimiza el códec Opus para que el móvil lo reconozca como nota de voz.
            const filters = "volume=30dB,acompressor=threshold=-10dB:ratio=20:attack=1:release=50,bass=g=15,treble=g=10";
            
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -ac 1 -ar 16000 -b:a 12k -application voip "${tempOut}"`;
            
            // Timeout de 5 minutos y buffer de 100MB para canciones pesadas
            await execPromise(cmd, { timeout: 300000, maxBuffer: 1024 * 1024 * 100 });

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("El procesamiento falló en FFmpeg.");
            }

            // 4. Enviar resultado como PTT (Nota de voz)
            // mimetype estricto para que Android/iOS lo reconozcan
            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            let msgError = "❌ Error al procesar.";
            if (e.message.includes('timeout')) msgError = "❌ La canción es demasiado larga para la CPU de la VPS.";
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            // Limpieza diferida
            setTimeout(() => {
                if (fs.existsSync(tempIn)) try { fs.unlinkSync(tempIn); } catch (e) {}
                if (fs.existsSync(tempOut)) try { fs.unlinkSync(tempOut); } catch (e) {}
            }, 10000);
        }
    }
};
