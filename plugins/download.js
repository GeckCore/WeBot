import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_BASE = 'https://api.evogb.org/beta';
const API_KEY = 'geckcore';

// Mapeo de dominios a endpoints de la API
const serviceMap = {
    // Instagram
    'instagram.com': { endpoint: 'dl-instagram', param: 'url' },
    'instagr.am': { endpoint: 'dl-instagram', param: 'url' },
    
    // TikTok
    'tiktok.com': { endpoint: 'dl-tiktok', param: 'url' },
    'vm.tiktok.com': { endpoint: 'dl-tiktok', param: 'url' },
    'vt.tiktok.com': { endpoint: 'dl-tiktok', param: 'url' },
    
    // Twitter / X
    'twitter.com': { endpoint: 'dl-twitter', param: 'url' },
    'x.com': { endpoint: 'dl-twitter', param: 'url' },
    'fxtwitter.com': { endpoint: 'dl-twitter', param: 'url' },
    
    // YouTube
    'youtube.com': { endpoint: 'dl-ytmp4', param: 'url' },
    'youtu.be': { endpoint: 'dl-ytmp4', param: 'url' },
    
    // Facebook
    'facebook.com': { endpoint: 'dl-facebook', param: 'url' },
    'fb.watch': { endpoint: 'dl-facebook', param: 'url' },
    
    // Pinterest
    'pinterest.com': { endpoint: 'dl-pinterest', param: 'url' },
    'pin.it': { endpoint: 'dl-pinterest', param: 'url' },
    
    // SoundCloud
    'soundcloud.com': { endpoint: 'dl-soundcloud', param: 'url' },
    'on.soundcloud.com': { endpoint: 'dl-soundcloud', param: 'url' },
    
    // Spotify
    'spotify.com': { endpoint: 'dl-spotify', param: 'url' },
    'open.spotify.com': { endpoint: 'dl-spotify', param: 'url' },
    
    // MediaFire
    'mediafire.com': { endpoint: 'dl-mediafire', param: 'url' },
    'www.mediafire.com': { endpoint: 'dl-mediafire', param: 'url' },
    
    // TeraBox
    'terabox.com': { endpoint: 'dl-terabox', param: 'url' },
    'teraboxapp.com': { endpoint: 'dl-terabox', param: 'url' },
    
    // Threads
    'threads.net': { endpoint: 'dl-threads', param: 'url' },
    'www.threads.net': { endpoint: 'dl-threads', param: 'url' },
};

export default {
    name: 'download_universal',
    // Detecta URLs de servicios soportados (solo si el propietario las envía)
    match: (text) => {
        if (!text || typeof text !== 'string') return false;
        const urlRegex = /https?:\/\/[^\s]+/i;
        return urlRegex.test(text);
    },

    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        // Extraer URL del mensaje
        const urlMatch = textoLimpio.match(/https?:\/\/[^\s]+/i);
        if (!urlMatch) return;
        
        const url = urlMatch[0];
        let parsedUrl;
        
        try {
            parsedUrl = new URL(url);
        } catch {
            return sock.sendMessage(remitente, { text: "❌ Enlace inválido." }, { quoted: msg });
        }
        
        const hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
        
        // Buscar el servicio correspondiente
        let service = null;
        
        // Búsqueda exacta
        if (serviceMap[hostname]) {
            service = serviceMap[hostname];
        } else {
            // Búsqueda parcial para subdominios
            for (const [domain, config] of Object.entries(serviceMap)) {
                if (hostname.endsWith('.' + domain) || hostname === domain) {
                    service = config;
                    break;
                }
            }
        }
        
        if (!service) {
            // No es un enlace soportado, ignorar silenciosamente
            return;
        }
        
        let statusMsg = await sock.sendMessage(remitente, { text: `⏳ Procesando ${hostname}...` }, { quoted: msg });
        
        try {
            // Construir URL de la API
            const apiUrl = `${API_BASE}/${service.endpoint}?apikey=${API_KEY}&${service.param}=${encodeURIComponent(url)}`;
            
            console.log(`[DOWNLOAD] Llamando a API: ${apiUrl}`);
            
            const response = await axios.get(apiUrl, {
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const data = response.data;
            
            // Manejar diferentes estructuras de respuesta de la API
            let downloadUrl = null;
            let title = 'archivo';
            let mimetype = 'application/octet-stream';
            let isVideo = false;
            let isAudio = false;
            let isImage = false;
            
            // Estructura común en APIs de download
            if (data.status === true || data.success === true || data.result) {
                const result = data.result || data.data || data;
                
                // Buscar URL de descarga en diferentes campos comunes
                downloadUrl = result.url || result.download_url || result.dl_url || 
                             result.link || result.video || result.audio || 
                             result.sd || result.hd || result.no_watermark;
                
                title = result.title || parsedUrl.hostname;
                
                // Determinar tipo de contenido
                if (result.type === 'video' || downloadUrl?.includes('.mp4') || downloadUrl?.includes('video')) {
                    isVideo = true;
                    mimetype = 'video/mp4';
                } else if (result.type === 'audio' || downloadUrl?.includes('.mp3') || downloadUrl?.includes('audio')) {
                    isAudio = true;
                    mimetype = 'audio/mpeg';
                } else if (result.type === 'image' || downloadUrl?.includes('.jpg') || downloadUrl?.includes('.png') || downloadUrl?.includes('image')) {
                    isImage = true;
                    mimetype = 'image/jpeg';
                }
            }
            
            if (!downloadUrl) {
                throw new Error('No se pudo obtener el enlace de descarga de la API');
            }
            
            // Descargar archivo
            await sock.sendMessage(remitente, { text: `📥 Descargando: ${title}...`, edit: statusMsg.key });
            
            const fileResponse = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const buffer = Buffer.from(fileResponse.data);
            const fileSizeMB = buffer.length / (1024 * 1024);
            
            // Verificar tamaño máximo de WhatsApp (50MB para video, 16MB para otros)
            const maxSize = isVideo ? 50 : 16;
            if (fileSizeMB > maxSize) {
                throw new Error(`El archivo pesa ${fileSizeMB.toFixed(1)}MB. Límite: ${maxSize}MB`);
            }
            
            // Enviar archivo según tipo
            await sock.sendMessage(remitente, { text: `🚀 Enviando (${fileSizeMB.toFixed(1)}MB)...`, edit: statusMsg.key });
            
            if (isVideo) {
                const tempFile = path.join(__dirname, `../temp_video_${Date.now()}.mp4`);
                fs.writeFileSync(tempFile, buffer);
                await sock.sendMessage(remitente, { 
                    video: { url: tempFile }, 
                    mimetype: 'video/mp4',
                    caption: `🎥 ${title}`
                }, { quoted: msg });
                fs.unlinkSync(tempFile);
            } else if (isAudio) {
                const tempFile = path.join(__dirname, `../temp_audio_${Date.now()}.mp3`);
                fs.writeFileSync(tempFile, buffer);
                await sock.sendMessage(remitente, { 
                    audio: { url: tempFile }, 
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`
                }, { quoted: msg });
                fs.unlinkSync(tempFile);
            } else if (isImage) {
                await sock.sendMessage(remitente, { 
                    image: buffer, 
                    mimetype: 'image/jpeg',
                    caption: `🖼️ ${title}`
                }, { quoted: msg });
            } else {
                // Documento genérico
                const tempFile = path.join(__dirname, `../temp_doc_${Date.now()}`);
                fs.writeFileSync(tempFile, buffer);
                await sock.sendMessage(remitente, { 
                    document: { url: tempFile },
                    mimetype: mimetype,
                    fileName: `${title}_download`
                }, { quoted: msg });
                fs.unlinkSync(tempFile);
            }
            
            await sock.sendMessage(remitente, { delete: statusMsg.key });
            
        } catch (error) {
            console.error('[DOWNLOAD ERROR]:', error.message);
            
            let errorMsg = '❌ Error al descargar:\n';
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                errorMsg += '⏱️ La descarga tardó demasiado. Intenta de nuevo.';
            } else if (error.response?.status === 404) {
                errorMsg += '🔗 El enlace no es válido o el contenido fue eliminado.';
            } else if (error.response?.status === 429) {
                errorMsg += '⚠️ Límite de peticiones excedido. Espera unos minutos.';
            } else if (error.message.includes('API')) {
                errorMsg += `🔧 Error del servicio: ${error.message}`;
            } else {
                errorMsg += `${error.message.substring(0, 150)}`;
            }
            
            await sock.sendMessage(remitente, { text: errorMsg, edit: statusMsg.key });
        }
    }
};
