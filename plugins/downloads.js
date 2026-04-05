// plugins/downloads.js
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const cheerio = require('cheerio');
const execPromise = util.promisify(exec);

module.exports = {
    name: 'downloads',
    match: (text) => /^(https?:\/\/[^\s]+)$/i.test(text) && !text.toLowerCase().includes('resume'),
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const urlLimpia = textoLimpio.match(/^(https?:\/\/[^\s]+)$/i)[1].split('&si=')[0].split('?si=')[0].split('&feature=')[0];
        let statusMsg = await sock.sendMessage(remitente, { text: "⏳ Interceptando enlace..." }, { quoted: msg });

        // Identificar la plataforma para enrutamiento
        let platform = null;
        if (urlLimpia.includes('tiktok.com')) platform = 'tiktok';
        else if (urlLimpia.includes('instagram.com')) platform = 'instagram';
        else if (urlLimpia.includes('facebook.com') || urlLimpia.includes('fb.watch')) platform = 'facebook';

        // --- RUTA 1: SCRAPER INSTATIKTOK (Para TikTok, Instagram y Facebook) ---
        if (platform) {
            try {
                const SITE_URL = 'https://instatiktok.com/';
                const form = new URLSearchParams();
                form.append('url', urlLimpia);
                form.append('platform', platform);
                form.append('siteurl', SITE_URL);

                // Petición HTTP simulando un formulario de navegador
                const res = await axios.post(`${SITE_URL}api`, form.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Origin': SITE_URL,
                        'Referer': SITE_URL,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (res.data?.status === 'success' && res.data?.html) {
                    const $ = cheerio.load(res.data.html);
                    const links = [];
                    
                    // Extraer los enlaces de los botones de descarga generados
                    $('a.btn[href^="http"]').each((_, el) => {
                        const l = $(el).attr('href');
                        if (l && !links.includes(l)) links.push(l);
                    });

                    if (links.length > 0) {
                        let dlMedia = [];
                        
                        // Lógica de filtrado extraída de la base proporcionada
                        if (platform === 'tiktok') {
                            dlMedia.push(links.find(l => /hdplay/.test(l)) || links[0]);
                        } else if (platform === 'facebook') {
                            dlMedia.push(links.at(-1)); // El último suele ser la versión HD
                        } else if (platform === 'instagram') {
                            dlMedia = links; // Instagram puede ser un carrusel (múltiples archivos)
                        }

                        if (dlMedia.length > 0 && dlMedia[0] !== undefined) {
                            await sock.sendMessage(remitente, { text: "🚀 Transmitiendo multimedia...", edit: statusMsg.key });
                            
                            for (const media of dlMedia) {
                                // Determinar formato por extensión
                                const isMp4 = media.includes('.mp4') || platform === 'tiktok' || platform === 'facebook';
                                
                                if (isMp4) {
                                    await sock.sendMessage(remitente, { video: { url: media }, mimetype: 'video/mp4' }, { quoted: msg });
                                } else {
                                    await sock.sendMessage(remitente, { image: { url: media } }, { quoted: msg });
                                }
                            }
                            return await sock.sendMessage(remitente, { delete: statusMsg.key });
                        }
                    }
                }
            } catch (err) {
                console.log(`[INFO] Scraper nativo falló para ${platform}. Pasando a yt-dlp...`);
            }
        }

        // --- RUTA 2: MOTOR LOCAL (yt-dlp) FALLBACK PARA EL RESTO ---
        await sock.sendMessage(remitente, { text: "⚙️ Desplegando motor local de extracción...", edit: statusMsg.key });

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
                lastError = e.message;
                if (fs.existsSync(`${outName}.${ext}`)) fs.unlinkSync(`${outName}.${ext}`);
            }
        }

        if (!success) {
            console.error(`[ERROR YT-DLP]:\n${lastError}`);
            return sock.sendMessage(remitente, { text: "❌ Bloqueado por la plataforma, DRM activo o enlace privado.", edit: statusMsg.key });
        }

        const finalFile = `${outName}.${ext}`;
        if (fs.statSync(finalFile).size / (1024 * 1024) > 50) {
            fs.unlinkSync(finalFile);
            return sock.sendMessage(remitente, { text: `⚠️ El archivo excede el límite máximo de RAM (50MB).`, edit: statusMsg.key });
        }

        await sock.sendMessage(remitente, { text: "🚀 Transmitiendo archivo final...", edit: statusMsg.key });
        
        if (isAudio) {
            await sock.sendMessage(remitente, { document: { url: finalFile }, mimetype: 'audio/wav', fileName: `${outName}.wav` }, { quoted: msg });
        } else {
            await sock.sendMessage(remitente, { video: { url: finalFile }, mimetype: 'video/mp4' }, { quoted: msg });
        }
        
        await sock.sendMessage(remitente, { delete: statusMsg.key });
        if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
    }
};
