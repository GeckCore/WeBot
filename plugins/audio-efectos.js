import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { tmpdir } from 'os';

export default {
    name: 'audio_effects',
    match: (text) => /^\.(bass|blown|deep|earrape|fast|fat|nightcore|reverse|robot|slow|smooth|tupai|squirrel|chipmunk)/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio, getMediaInfo, downloadContentFromMessage, quoted }) => {
        
        const command = textoLimpio.split(/\s+/)[0].replace('.', '').toLowerCase();
        const info = getMediaInfo(msg.message) || getMediaInfo(quoted);

        if (!info || !/audio/.test(info.type)) {
            return sock.sendMessage(remitente, { text: "❌ Responde a un audio o nota de voz para aplicar el efecto." }, { quoted: msg });
        }

        // Definición de la ruta al ejecutable en la carpeta principal
        const ffmpegPath = process.platform === 'win32' 
            ? join(process.cwd(), 'ffmpeg.exe') 
            : join(process.cwd(), 'ffmpeg');

        if (!existsSync(ffmpegPath)) {
            return sock.sendMessage(remitente, { text: `❌ No se encontró el binario de FFmpeg en: ${ffmpegPath}` });
        }

        let set;
        if (/bass/.test(command)) set = '-af equalizer=f=94:width_type=o:width=2:g=30';
        if (/blown/.test(command)) set = '-af acrusher=.1:1:64:0:log';
        if (/deep/.test(command)) set = '-af atempo=4/4,asetrate=44500*2/3';
        if (/earrape/.test(command)) set = '-af volume=12';
        if (/fast/.test(command)) set = '-filter:a "atempo=1.63,asetrate=44100"';
        if (/fat/.test(command)) set = '-filter:a "atempo=1.6,asetrate=22100"';
        if (/nightcore/.test(command)) set = '-filter:a atempo=1.06,asetrate=44100*1.25';
        if (/reverse/.test(command)) set = '-filter_complex "areverse"';
        if (/robot/.test(command)) set = "-filter_complex \"afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75\"";
        if (/slow/.test(command)) set = '-filter:a "atempo=0.7,asetrate=44100"';
        if (/smooth/.test(command)) set = '-filter:v "minterpolate=\'mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120\'"';
        if (/tupai|squirrel|chipmunk/.test(command)) set = '-filter:a "atempo=0.5,asetrate=65100"';

        const tempInput = join(tmpdir(), `input_${Date.now()}.mp3`);
        const tempOutput = join(tmpdir(), `output_${Date.now()}.mp3`);

        try {
            const stream = await downloadContentFromMessage(info.msg, info.type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            writeFileSync(tempInput, buffer);

            // Uso de la ruta absoluta al binario local
            exec(`"${ffmpegPath}" -i ${tempInput} ${set} ${tempOutput}`, async (err) => {
                if (err) {
                    console.error("FFmpeg Error:", err);
                    return sock.sendMessage(remitente, { text: "❌ Error crítico al procesar el audio." });
                }

                const finalBuffer = readFileSync(tempOutput);
                await sock.sendMessage(remitente, { 
                    audio: finalBuffer, 
                    mimetype: 'audio/mp4', 
                    ptt: true 
                }, { quoted: msg });

                try { unlinkSync(tempInput); unlinkSync(tempOutput); } catch (e) {}
            });

        } catch (e) {
            console.error("Audio Effects Error:", e);
            sock.sendMessage(remitente, { text: `❌ Fallo técnico: ${e.message}` });
        }
    }
};
