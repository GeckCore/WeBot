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
            return sock.sendMessage(remitente, { text: '⚠️ Responde a un audio o video para saturarlo.' }, { quoted: msg });
        }

        const timestamp = Date.now();
        const tempIn = path.join(process.cwd(), `temp_in_${timestamp}`);
        const tempOut = path.join(process.cwd(), `temp_out_${timestamp}.ogg`);
        const ffmpegPath = path.join(process.cwd(), 'ffmpeg');

        try {
            await sock.sendMessage(remitente, { text: '😤 *REVENTANDO AUDIO...* ⚠️' }, { quoted: msg });

            // 2. Descarga de flujo (stream) para mayor estabilidad en audios largos
            const mediaType = q.audioMessage ? 'audio' : 'video';
            const stream = await downloadContentFromMessage(audioMsg, mediaType);
            let buffers = [];
            for await (const chunk of stream) buffers.push(chunk);
            const buffer = Buffer.concat(buffers);
            
            if (buffer.length === 0) throw new Error("Archivo vacío.");
            fs.writeFileSync(tempIn, buffer);

            // 3. FFMPEG: Saturación de Memoria/Shitpost (Entendible pero reventada)
            // volume=40dB: Ganancia masiva para forzar la saturación digital.
            // bass=g=25: Retumbe extremo de graves.
            // treble=g=15: Agudos altos para que la voz no se pierda en el ruido.
            // acompressor: Aplana la onda para que suene "crujiente" sin romper el archivo.
            // alimiter=limit=0.9: Límite alto para evitar que WA detecte el audio como corrupto.
            const filters = "volume=40dB,bass=g=25,treble=g=15,acompressor=threshold=-10dB:ratio=20:attack=1:release=50,alimiter=limit=0.9";
            
            // Bajamos el bitrate de salida a 32k para que el proceso sea más rápido en la VPS y no de error de buffer
            const cmd = `"${ffmpegPath}" -i "${tempIn}" -af "${filters}" -c:a libopus -b:a 32k -vbr on "${tempOut}"`;
            
            // Aumentamos los límites de ejecución para audios de varios minutos
            await execPromise(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });

            if (!fs.existsSync(tempOut) || fs.statSync(tempOut).size < 100) {
                throw new Error("El procesamiento falló o el archivo es demasiado grande.");
            }

            // 4. Enviar como nota de voz
            await sock.sendMessage(remitente, { 
                audio: { url: tempOut }, 
                mimetype: 'audio/ogg; codecs=opus', 
                ptt: true 
            }, { quoted: msg });

        } catch (e) {
            console.error('[SATURAR ERROR]:', e);
            let msgError = "❌ Error al procesar.";
            if (e.message.includes('timeout')) msgError = "❌ Audio demasiado pesado para la VPS.";
            else if (e.message.includes('50MB')) msgError = "❌ El archivo excede el límite de WhatsApp.";
            
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            // Limpieza estricta de temporales
            setTimeout(() => {
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            }, 2000);
        }
    }
};
