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
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Evaluando nodos de extracción..." }, { quoted: msg });

        let mediaUrl = null;

        // --- RUTA 1: CASCADA DE APIs EXTERNAS (Evita bloqueos de VPS) ---
        try {
            let apis = [];
            const url = encodeURIComponent(urlLimpia);

            if (urlLimpia.includes('tiktok.com')) {
                apis = [
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/tiktok?url=${url}`)).data?.data?.play,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/ttdl?url=${url}`)).data?.data?.play,
                    async () => (await axios.get(`https://deliriussapi-oficial.vercel.app/download/tiktok?url=${url}`)).data?.data?.no_wm,
                    async () => (await axios.get(`https://api.vreden.web.id/api/tiktok?url=${url}`)).data?.result?.video
                ];
            } else if (urlLimpia.includes('instagram.com')) {
                apis = [
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${url}`)).data?.data?.[0]?.url,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${url}`)).data?.data?.[0]?.url,
                    async () => (await axios.get(`https://deliriussapi-oficial.vercel.app/download/igdl?url=${url}`)).data?.data?.[0]?.url,
                    async () => (await axios.get(`https://api.vreden.web.id/api/igdl?url=${url}`)).data?.result?.[0]?.url
                ];
            } else if (urlLimpia.includes('x.com') || urlLimpia.includes('twitter.com')) {
                apis = [
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/twitter?url=${url}`)).data?.data?.video,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/twitter?url=${url}`)).data?.media?.[0]?.url,
                    async () => (await axios.get(`https://api.vreden.web.id/api/twitter?url=${url}`)).data?.result?.video
                ];
            } else if (urlLimpia.includes('facebook.com') || urlLimpia.includes('fb.watch')) {
                apis = [
                    async () => (await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${url}`)).data?.data?.hd,
                    async () => (await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${url}`)).data?.data?.hd
                ];
            }

            // Ejecutar cascada de APIs (hasta 4 intentos rápidos)
            for (let i = 0; i < apis.length; i++) {
                try {
                    const dlUrl = await apis[i]();
                    if (dlUrl && dlUrl.startsWith('http')) {
                        mediaUrl = dlUrl;
                        break;
                    }
                } catch (e) {
                    continue; // Pasa al siguiente nodo silenciosamente
                }
            }

            // Si un nodo funcionó, enviamos y cortamos la ejecución
            if (mediaUrl) {
                await sock.sendMessage(remitente, { text: "🚀 Transmitiendo desde nodo externo...", edit: statusMsg.key });
                await sock.sendMessage(remitente, { video: { url: mediaUrl }, mimetype: 'video/mp4' }, { quoted: msg });
                return await sock.sendMessage(remitente, { delete: statusMsg.key });
            }
        } catch (error) {
            console.log("[INFO] Cascada externa falló.");
        }

        // --- RUTA 2: MOTOR LOCAL (yt-dlp) ---
        await sock.sendMessage(remitente, { text: "⚙️ Nodos saturados. Forzando motor local...", edit: statusMsg.key });

        const isAudio = ['music.youtube.com', 'soundcloud.com', 'spotify.com', 'tidal.com', 'deezer.com', 'apple.com/music'].some(d => urlLimpia.includes(d));
        const usaDRM = ['spotify.com', 'tidal.com'].some(d => urlLimpia.includes(d));

        const outName = `dl_${Date.now()}`;
        const ext = isAudio ? 'wav' : 'mp4';
        
        const format = isAudio ? '-f "bestaudio/best" -x --audio-format wav' : '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
        const cookieArg = fs.existsSync('./cookies.txt') ? '--cookies ./cookies.txt' : '';
        const cmdBase = `./yt-dlp --no-playlist --no-warnings --no-check-certificate --ffmpeg-location ./ffmpeg ${cookieArg} -o "${outName}.%(ext)s" ${format}`;

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
            attempts = [`${cmdBase} "${urlLimpia}"`];
        }

        let success = false;
        let lastError = "";

        for (const cmd of attempts) {
            try {
                await execPromise(cmd);
                if (fs.existsSync(`${outName}.${ext}`)) { success = true; break; }
            } catch (e) {
                lastError = e.message; // Capturamos el error real de la consola
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) {
            console.error(`[ERROR YT-DLP DETALLADO]:\n${lastError}`); // Esto imprimirá el fallo exacto en tu panel de Pterodactyl
            return sock.sendMessage(remitente, { text: "❌ Bloqueado por la plataforma, DRM activo o enlace privado.\n\n_Revisa la consola para ver el código de error exacto._", edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        if (fs.statSync(finalFile).size / (1024 * 1024) > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo excede el límite máximo (50MB).`, edit: statusMsg.key });
        }

        await sock.sendMessage(remitente, { text: "🚀 Transmitiendo...", edit: statusMsg.key });
        
        if (isAudio) {
            await sock.sendMessage(remitente, { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `${outName}.wav` }, { quoted: msg });
        } else {
            await sock.sendMessage(remitente, { video: { url: finalFile }, mimetype: 'video/mp4' }, { quoted: msg });
        }
        
        await sock.sendMessage(remitente, { delete: statusMsg.key });
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
};
