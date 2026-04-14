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
    match: (text) => /^\.(ytmp3|ytmp4)\s+/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const command = args[0].toLowerCase().replace('.', '');
        const url = args[1];

        if (!url) {
            return sock.sendMessage(remitente, { text: "❌ Envía un link de YouTube válido." }, { quoted: msg });
        }

        let statusMsg = await sock.sendMessage(remitente, { text: `⏳ Conectando con la API para ${command.toUpperCase()}...` }, { quoted: msg });

        try {
            if (command === 'ytmp3') {
                await sock.sendPresenceUpdate('recording', remitente);
                
                // 1. FASE DE API
                let data;
                try {
                    data = await fg.yta(url);
                } catch (apiErr) {
                    throw new Error(`API_ERROR: La API fg-senna rechazó el link o está caída. (${apiErr.message})`);
                }

                if (!data || !data.dl_url) {
                    throw new Error("API_EMPTY: La API respondió, pero no entregó un enlace de descarga (posible restricción de edad/copyright).");
                }

                let title = data.title || "YouTube Audio";
                await sock.sendMessage(remitente, { text: `⬇️ Descargando buffer: *${title}*...`, edit: statusMsg.key });

                // 2. FASE DE DESCARGA DE BUFFER (Con Timeout de 60s para evitar cuelgues)
                let response;
                try {
                    response = await fetch(data.dl_url, { signal: AbortSignal.timeout(60000) });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                } catch (fetchErr) {
                    const failReason = fetchErr.name === 'TimeoutError' ? 'Tiempo de espera (60s) agotado' : fetchErr.message;
                    throw new Error(`FETCH_ERROR: Fallo al extraer el archivo de los servidores (${failReason}).`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                if (buffer.length === 0) {
                    throw new Error("BUFFER_EMPTY: El archivo descargado está corrupto (0 bytes).");
                }

                // 3. FASE DE CONVERSIÓN FFMPEG
                await sock.sendMessage(remitente, { text: `⚙️ Reconstruyendo formato MP3 para móviles...`, edit: statusMsg.key });
                
                const timestamp = Date.now();
                const tempIn = path.join(__dirname, `../temp_in_${timestamp}`);
                const tempOut = path.join(__dirname, `../temp_out_${timestamp}.mp3`);
                const ffmpegPath = path.join(__dirname, '../ffmpeg');

                fs.writeFileSync(tempIn, buffer);

                try {
                    // Límite de 90 segundos para conversión en CPU
                    await execPromise(`"${ffmpegPath}" -i "${tempIn}" -b:a 128k "${tempOut}"`, { timeout: 90000 });
                } catch (ffmpegErr) {
                    if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                    throw new Error(`FFMPEG_ERROR: FFmpeg no pudo procesar el archivo. Formato original incompatible o dañado.`);
                }

                // 4. FASE DE VERIFICACIÓN DE TAMAÑO
                const stats = fs.statSync(tempOut);
                const sizeMB = stats.size / (1024 * 1024);
                
                if (sizeMB > 50) {
                    fs.unlinkSync(tempIn);
                    fs.unlinkSync(tempOut);
                    throw new Error(`FILE_TOO_LARGE: El audio convertido pesa ${sizeMB.toFixed(1)}MB. WhatsApp solo permite 50MB.`);
                }

                await sock.sendMessage(remitente, { text: `🚀 Enviando archivo final (${sizeMB.toFixed(1)}MB)...`, edit: statusMsg.key });

                // 5. ENVÍO
                await sock.sendMessage(remitente, {
                    audio: { url: tempOut },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false 
                }, { quoted: msg });

                // Limpieza normal
                if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
                if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);

            } else if (command === 'ytmp4') {
                await sock.sendPresenceUpdate('composing', remitente);
                
                let data;
                try {
                    data = await fg.ytv(url, "480p");
                } catch (apiErr) {
                    throw new Error(`API_ERROR: La API fg-senna falló al procesar el vídeo. (${apiErr.message})`);
                }

                if (!data || !data.dl_url) throw new Error("API_EMPTY: No se obtuvo enlace de descarga del vídeo.");

                let title = data.title || "YouTube Video";

                await sock.sendMessage(remitente, { text: `🚀 Enviando vídeo: *${title}*...`, edit: statusMsg.key });

                await sock.sendMessage(remitente, {
                    video: { url: data.dl_url },
                    caption: `🎥 *${title}*`
                }, { quoted: msg });
            }

            // Borramos el mensaje de actualización si todo salió bien
            await sock.sendMessage(remitente, { delete: statusMsg.key });

        } catch (e) {
            console.error(`[YOUTUBE DL ERROR] ${command}:`, e);
            
            // Traducción del error técnico a un mensaje útil para ti
            const errorLog = e.message || "Desconocido";
            let userMsg = "❌ *Fallo en la descarga*\n\n*Diagnóstico:* ";
            
            if (errorLog.includes("API_ERROR")) userMsg += "La API (fg-senna) está caída en este momento o el vídeo tiene restricciones (privado/edad).";
            else if (errorLog.includes("API_EMPTY")) userMsg += "La API respondió, pero no devolvió el enlace descargable.";
            else if (errorLog.includes("FETCH_ERROR")) userMsg += "Los servidores de extracción tardaron demasiado en responder (Timeout) o caducó el enlace.";
            else if (errorLog.includes("BUFFER_EMPTY")) userMsg += "El archivo llegó corrupto (0 bytes).";
            else if (errorLog.includes("FFMPEG_ERROR")) userMsg += "Fallo al convertir el audio. El archivo original que entregó la API está dañado.";
            else if (errorLog.includes("FILE_TOO_LARGE")) userMsg += errorLog.split('FILE_TOO_LARGE: ')[1];
            else userMsg += `Error técnico inesperado:\n${errorLog.substring(0, 100)}`;

            await sock.sendMessage(remitente, { text: userMsg, edit: statusMsg.key });
        }
    }
};
