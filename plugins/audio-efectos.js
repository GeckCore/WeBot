import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { tmpdir } from 'os';

export default {
    name: 'audio_effects',
    match: (text) => /^\.(bass|blown|deep|earrape|fast|fat|nightcore|reverse|robot|slow|smooth|tupai|squirrel|chipmunk)/i.test(text),
    execute: async ({ sock, remitente, msg, textoLimpio, downloadContentFromMessage, quoted }) => {
        
        const command = textoLimpio.split(/\s+/)[0].replace('.', '').toLowerCase();
        
        // Extracción segura y directa del nodo del mensaje
        const targetMsg = quoted ? quoted.message : msg.message;
        if (!targetMsg) return;

        const msgType = Object.keys(targetMsg).find(k => ['audioMessage', 'videoMessage', 'documentMessage'].includes(k));
        
        if (!msgType) {
            return sock.sendMessage(remitente, { text: "❌ Responde a un audio, video o documento." }, { quoted: msg });
        }

        const mediaData = targetMsg[msgType];
        const isAudio = /audio/.test(mediaData?.mimetype) || mediaData?.mimetype === 'audio/mpeg';
        const isVideo = /video/.test(mediaData?.mimetype);

        if (!isAudio && !isVideo) {
            return sock.sendMessage(remitente, { text: "❌ El archivo no contiene un formato multimedia tratable." }, { quoted: msg });
        }

        const ffmpegPath = process.platform === 'win32' 
            ? join(process.cwd(), 'ffmpeg.exe') 
            : join(process.cwd(), 'ffmpeg');

        if (!existsSync(ffmpegPath)) {
            return sock.sendMessage(remitente, { text: "❌ Binario de FFmpeg no detectado en el directorio raíz." });
        }

        let set = '';
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
        if (/smooth/.test(command)) set = '-af "aresample=44100"';
        if (/tupai|squirrel|chipmunk/.test(command)) set = '-filter:a "atempo=0.5,asetrate=65100"';

        // Archivos de E/S. La salida DEBE ser .ogg para notas de voz.
        const tempInput = join(tmpdir(), `in_${Date.now()}`);
        const tempOutput = join(tmpdir(), `out_${Date.now()}.ogg`); 

        try {
            const stream = await downloadContentFromMessage(mediaData, msgType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            writeFileSync(tempInput, buffer);

            // Conversión nativa a OPUS. ar=48000 es la frecuencia estándar de WhatsApp.
            exec(`"${ffmpegPath}" -i "${tempInput}" ${set} -c:a libopus -ar 48000 -ac 1 -b:a 64k "${tempOutput}"`, async (err) => {
                if (err) {
                    console.error("Error FFmpeg:", err);
                    return sock.sendMessage(remitente, { text: "❌ Fallo en la codificación de FFmpeg." });
                }

                const finalBuffer = readFileSync(tempOutput);
                await sock.sendMessage(remitente, { 
                    audio: finalBuffer, 
                    mimetype: 'audio/ogg; codecs=opus', // Tipo MIME estricto requerido por Meta
                    ptt: true 
                }, { quoted: msg });

                try { unlinkSync(tempInput); unlinkSync(tempOutput); } catch (e) {}
            });

        } catch (e) {
            console.error("Audio Plugin Error:", e);
            sock.sendMessage(remitente, { text: `❌ Error de buffer: ${e.message}` });
        }
    }
};
