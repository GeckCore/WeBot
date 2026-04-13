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
        // 1. Validar contenido multimedia (Audio, Video, Notas de voz y ViewOnce)
        const q = quoted || msg.message;
        const audioMsg = q?.audioMessage || q?.videoMessage || q?.viewOnceMessage?.message?.audioMessage || q?.viewOnceMessageV2?.message?.audioMessage;

        if (!audioMsg) {
            return sock.sendMessage(remitente, { text: '⚠️ Responde a un audio o video para saturarlo.' }, { quoted: msg });
        }

        const timestamp = Date.now();
        const tempIn = path.join(process.cwd(), `temp_in_${timestamp}`);
        const tempOut = path.join(process.cwd(), `temp_out_${timestamp}.ogg`);
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '🎚️ *Saturando audio...* (Esto puede tardar en canciones largas)' }, { quoted: msg });

            // 2. Descargar el contenido
            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // 3. FFMPEG: Saturación estilo "Classic Shitpost"
            // bass=g=20: Potencia los graves significativamente.
            // treble=g=12: Mantiene la nitidez de la voz para que sea "entendible".
            // volume=22dB: Ganancia alta para saturar la señal.
            // alimiter: El truco para que suene fuerte pero no se rompa el archivo de audio.
            const filters = "bass=g=20,treble=g=12,volume=22dB,alimiter=level_in=1:level_out=1:limit=0.5:attack=5:release=20";
            
            // Aumentamos timeout a 90s y buffer a 20MB para procesar canciones completas
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -b:a 64k -vbr on "${tempOut}"`;
            
            await execPromise(cmd, { timeout: 90000, maxBuffer: 1024 * 1024 * 20 });

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("El archivo de salida es demasiado pequeño o no se generó.");
            }

            // 4. Verificar tamaño para WhatsApp (Límite 50MB)
            const stats = fs.statSync(tempOut);
            if (stats.size > 50 * 1024 * 1024) {
                throw new Error("El audio saturado excede los 50MB permitidos por WhatsApp.");
            }

            // 5. Enviar como nota de voz
            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            let msgError = "❌ Error al procesar.";
            if (e.message.includes('timeout')) msgError = "❌ El audio es demasiado largo para la CPU de la VPS.";
            else if (e.message.includes('50MB')) msgError = "❌ El archivo resultante es demasiado pesado.";
            
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            // Limpieza garantizada
            if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        }
    }
};
