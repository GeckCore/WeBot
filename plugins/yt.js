import fg from "fg-senna";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { fileURLToPath } from "url";

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
    name: 'youtube_dl',
    // Captura tanto .ytmp3 como .ytmp4
    match: (text) => /^\.(yta|ytv)\s+/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        const url = args[1];

        if (!url) {
            return sock.sendMessage(remitente, { text: "❌ Envía un link de YouTube válido." }, { quoted: msg });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: `⏳ Procesando ${command.toUpperCase()}...` }, { quoted: msg });

        try {
            if (command === 'yta') {
                await sock.sendPresenceUpdate('recording', remitente);
                let data = await fg.yta(url);
                let title = data.title || "YouTube Audio";

                // 1. Descargamos el archivo original (que suele ser WebM o AAC disfrazado)
                const response = await fetch(data.dl_url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // 2. Rutas temporales y binario
                const timestamp = Date.now();
                const tempIn = path.join(__dirname, `../temp_in_${timestamp}`);
                const tempOut = path.join(__dirname, `../temp_out_${timestamp}.mp3`);
                const ffmpegPath = path.join(__dirname, '../ffmpeg');

                // 3. Escribimos a disco
                fs.writeFileSync(tempIn, buffer);

                // 4. FIX CRÍTICO MÓVILES: Forzar conversión a MP3 real. 
                // Esto reconstruye los metadatos y el códec para que Android/iOS no bloqueen el audio.
                await execPromise(`"${ffmpegPath}" -i "${tempIn}" -b:a 128k "${tempOut}"`);

                // 5. Enviamos el MP3 estandarizado
                await sock.sendMessage(remitente, {
                    audio: { url: tempOut },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false 
                }, { quoted: msg });

                // 6. Limpieza de temporales
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);

            } else if (command === 'ytv') {
                await sock.sendPresenceUpdate('composing', remitente);
                let data = await fg.ytv(url, "480p");
                let title = data.title || "YouTube Video";

                await sock.sendMessage(remitente, {
                    video: { url: data.dl_url },
                    caption: `🎥 *${title}*`
                }, { quoted: msg });
            }

            // Borramos el mensaje de "Procesando..."
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error(`❌ Error en ${command}:`, e);
            sock.sendMessage(remitente, { text: "❌ Error descargando el archivo. La API de fg-senna podría estar caída o el link es inválido.", edit: statusMsg.key });
        }
    }
};
