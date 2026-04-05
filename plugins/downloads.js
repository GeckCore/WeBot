// plugins/downloads.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const urlLimpia = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i)[1].split('&si=')[0].split('?si=')[0].split('&feature=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Evaluando ruta de extracción..." }, { quoted: msg });

        let mediaUrl = null;

        try {
            // --- RUTA 1: APIs EXTERNAS (Evasión total de IP Block) ---
            if (urlLimpia.includes('tiktok.com')) {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(urlLimpia)}`);
                mediaUrl = res.data?.data?.play || res.data?.data?.video; // Prioriza sin marca de agua
            }
            else if (urlLimpia.includes('instagram.com')) {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(urlLimpia)}`);
                mediaUrl = res.data?.data?.[0]?.url;
            }
            else if (urlLimpia.includes('x.com') || urlLimpia.includes('twitter.com')) {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${encodeURIComponent(urlLimpia)}`);
                mediaUrl = res.data?.data?.media?.[0]?.url || res.data?.data?.video;
            }
            else if (urlLimpia.includes('facebook.com') || urlLimpia.includes('fb.watch') || urlLimpia.includes('fb.gg')) {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(urlLimpia)}`);
                mediaUrl = res.data?.data?.hd || res.data?.data?.sd;
            }

            // Si el nodo externo capturó el enlace, transmitimos directo a memoria
            if (mediaUrl) {
                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo desde nodo externo...", edit: statusMsg.key });
                await sock.sendMessage(remitente, { video: { url: mediaUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            }
        } catch (apiError) {
            console.log("[INFO] API saturada o enlace no soportado, activando fallback local...");
        }

        // --- RUTA 2: MOTOR LOCAL (yt-dlp) PARA EL RESTO DE PLATAFORMAS ---
        await sock.sendMessage(remitente, { text: "⚙️ Extrayendo con motor local...", edit: statusMsg.key });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const usaDRM = ['spotify.com', 'tidal.com'].some(d => urlLimpia.includes(d));

        const outName = `dl_${Date.now()}`;
        const ext = isAudio ? 'wav' : 'mp4';
        const format = isAudio ? '-f "bestaudio/best" -x --audio-format wav' : '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cmdBase = `./yt-dlp --no-playlist --no-warnings -o "${outName}.%(ext)s" ${format}`;
        
        // Bloque lógico de comandos: Solo aplica hacks de YouTube si el enlace es de YouTube
        let attempts = [];
        if (usaDRM) {
            attempts = [`${cmdBase} "ytsearch1:${urlLimpia}"`];
        } else if (urlLimpia.includes('youtube.com') || urlLimpia.includes('youtu.be')) {
            attempts = [
                `${cmdBase} --extractor-args "youtube:player_client=android" --add-header "User-Agent:Mozilla/5.0" "${urlLimpia}"`,
                `${cmdBase} --extractor-args "youtube:player_client=ios" "${urlLimpia}"`,
                `${cmdBase} "${urlLimpia}"`
            ];
        } else {
            // Comando limpio para cualquier otra web que yt-dlp soporte
            attempts = [`${cmdBase} "${urlLimpia}"`];
        }

        let success = false;
        for (const cmd of attempts) {
            try {
                await execPromise(cmd);
                if (fs.existsSync(`${outName}.${ext}`)) { success = true; break; }
            } catch (e) {
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) return sock.sendMessage(remitente, { text: "❌ Bloqueado por la plataforma, DRM activo o enlace privado.", edit: statusMsg.key });

        const finalFile = `${outName}.${ext}`;
        if (fs.statSync(finalFile).size / (1024 * 1024) > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo excede el límite máximo de memoria (50MB).`, edit: statusMsg.key });
        }

        await sock.sendMessage(remitente, { text: "🚀 Transmitiendo archivo final...", edit: statusMsg.key });
        await sock.sendMessage(remitente, isAudio ? { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `${outName}.wav` } : { video: { url: finalFile }, mimetype: 'video/mp4' }, { quoted: msg });
        
        await sock.sendMessage(remitente, { delete: statusMsg.key });
        fs.unlinkSync(finalFile);
    }
};
