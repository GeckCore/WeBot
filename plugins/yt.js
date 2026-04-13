import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    name: 'youtube_dl',
    // Captura tanto .ytmp3 como .ytmp4
    match: (text) => /^\.(ytmp3|ytmp4)\s+/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        const url = args[1];

        if (!url || !url.includes('http')) {
            return sock.sendMessage(remitente, { text: "❌ Envía un link de YouTube válido." }, { quoted: msg });
        }

        const timestamp = Date.now();
        const outName = path.join(__dirname, `../dl_yt_${timestamp}`);
        const ytDlpPath = path.join(__dirname, '../yt-dlp');
        const ffmpegPath = path.join(__dirname, '../ffmpeg');

        let statusMsg = await sock.sendMessage(remitente, { text: `⏳ Procesando ${command.toUpperCase()} con yt-dlp...` }, { quoted: msg });

        try {
            if (command === 'ytmp3') {
                await sock.sendPresenceUpdate('recording', remitente);
                let data = await fg.yta(url);
                let title = data.title || "YouTube Audio";
                
                await sock.sendMessage(remitente, {
                    audio: { url: data.dl_url },
                    mimetype: 'audio/mp4',
                    fileName: `${title}.m4a`,
                    ptt: false // Para enviarlo como canción/archivo y no como nota de voz
                }, { quoted: msg });

            } else if (command === 'ytmp4') {
                cmd = `"${ytDlpPath}" --ffmpeg-location "${ffmpegPath}" -f "bestvideo[height<=480]+bestaudio/best[height<=480]" --merge-output-format mp4 --no-playlist --geo-bypass -o "${outName}.%(ext)s" "${url}"`;
            }

            await execPromise(cmd, { timeout: 120000 }); // 2 min de límite

            const finalFile = `${outName}.${ext}`;

            if (!fs.existsSync(finalFile)) {
                throw new Error("El archivo no se generó. Es posible que el video sea privado o no compatible.");
            }

            const stats = fs.statSync(finalFile);
            const fileSizeInMB = stats.size / (1024 * 1024);

            if (fileSizeInMB > 50) {
                if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
                return sock.sendMessage(remitente, { text: `⚠️ El archivo pesa ${fileSizeInMB.toFixed(1)}MB. Límite de WhatsApp: 50MB.` }, { edit: statusMsg.key });
            }

            await sock.sendMessage(remitente, { text: "🚀 Enviando..." }, { edit: statusMsg.key });

            if (command === 'ytmp3') {
                await sock.sendMessage(remitente, { 
                    audio: { url: finalFile }, 
                    mimetype: mimetype, 
                    fileName: `audio_${timestamp}.mp3`,
                    ptt: false 
                }, { quoted: msg });
            } else {
                await sock.sendMessage(remitente, { 
                    video: { url: finalFile }, 
                    mimetype: mimetype,
                    caption: `✅ Descarga finalizada.`
                }, { quoted: msg });
            }

            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error(`❌ Error en ${command}:`, e);
            const errLog = e.stderr || e.message || "Error desconocido";
            sock.sendMessage(remitente, { text: `❌ Error descargando:\n${errLog.substring(0, 100)}` }, { edit: statusMsg.key });
        } finally {
            // Limpieza de archivos temporales
            setTimeout(() => {
                const files = fs.readdirSync(path.join(__dirname, '../'));
                files.filter(f => f.startsWith(`dl_yt_${timestamp}`)).forEach(f => {
                    try { fs.unlinkSync(path.join(__dirname, '../', f)); } catch (err) {}
                });
            }, 5000);
        }
    }
};
