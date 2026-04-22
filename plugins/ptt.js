import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

export default {
    name: 'audio_infinito',
    // Captura el comando .ptt si hay un audio o video citado
    match: (text, { quoted, getMediaInfo }) => {
        const info = getMediaInfo(quoted);
        return /^\.ptt$/i.test(text) && quoted && (info?.type === 'audio' || info?.type === 'video');
    },
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        const mediaInfo = getMediaInfo(quoted);
        if (!mediaInfo) return;

        // Intento de borrar el comando para no dejar rastro del "truco"
        try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        const idStr = Date.now().toString();
        const tmpDir = path.resolve('./tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const inputPath = path.join(tmpDir, `in_${idStr}.${mediaInfo.ext}`);
        const outputPath = path.join(tmpDir, `out_${idStr}.ogg`);

        try {
            // Descarga del contenido original
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const ffmpegPath = path.resolve('./ffmpeg');
            
            // Conversión a formato OGG Opus (Estándar de WhatsApp para PTT)
            // Se usa un bitrate bajo y compresión máxima para asegurar compatibilidad
            await execPromise(`"${ffmpegPath}" -i "${inputPath}" -c:a libopus -b:a 48K -vbr on -compression_level 10 -frame_duration 20 -application voip "${outputPath}" -y`);

            if (!fs.existsSync(outputPath)) throw new Error("FFmpeg no pudo generar el archivo de salida.");

            const audioBuffer = fs.readFileSync(outputPath);

            // Generación de Waveform caótico (ondas de sonido visuales aleatorias)
            const fakeWaveform = Buffer.alloc(64);
            for(let i = 0; i < 64; i++) {
                fakeWaveform[i] = Math.floor(Math.random() * 255);
            }

            // --- ENVÍO DEL EXPLOIT ---
            await sock.sendMessage(remitente, {
                audio: audioBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true, // Lo marca como nota de voz (micrófono verde)
                seconds: 999999999, // Duración visual infinita
                waveform: fakeWaveform // Ondas visuales corruptas
            }, { quoted: msg }); // FIX: Se usa 'msg' para evitar el error de 'fromMe'

        } catch (err) {
            console.error("Error PTT Glitch:", err);
            await sock.sendMessage(remitente, { text: `❌ Error en la matriz de audio: ${err.message}` });
        } finally {
            // Limpieza de archivos temporales para mantener la VPS ligera
            [inputPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
