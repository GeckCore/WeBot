import fetch from 'node-fetch';

const API_BASE = 'https://api.evogb.org';
const API_KEY = 'geckcore';

// Mapeo de dominios a endpoints de la API (formato: /dl/servicio)
const serviceMap = {
    // Instagram
    'instagram.com': '/dl/instagram',
    'instagr.am': '/dl/instagram',
    
    // MediaFire
    'mediafire.com': '/dl/mediafire',
    
    // Pinterest
    'pinterest.com': '/dl/pinterest',
    'pin.it': '/dl/pinterest',
    
    // SoundCloud
    'soundcloud.com': '/dl/soundcloud',
    'on.soundcloud.com': '/dl/soundcloud',
    
    // Spotify
    'spotify.com': '/dl/spotify',
    'open.spotify.com': '/dl/spotify',
    
    // TeraBox
    'terabox.com': '/dl/terabox',
    '1024tera.com': '/dl/terabox',
    
    // Threads
    'threads.net': '/dl/threads',
    
    // TikTok
    'tiktok.com': '/dl/tiktok',
    'vm.tiktok.com': '/dl/tiktok',
    'vt.tiktok.com': '/dl/tiktok',
    
    // Twitter / X
    'twitter.com': '/dl/twitter',
    'x.com': '/dl/twitter',
    
    // YouTube - diferentes endpoints según tipo
    'youtube.com': '/dl/youtube',
    'youtu.be': '/dl/youtube',
};

// Servicios que solo devuelven audio
const audioOnlyServices = ['/dl/tiktokmp3', '/dl/ytmp3'];

async function processDownload(m, conn) {
    let text = (m.text || '').trim();
    
    // Buscar URL en el mensaje
    let urlMatch = text.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/i);
    if (!urlMatch) return;
    
    let url = urlMatch[0];
    let parsedUrl;
    
    try {
        parsedUrl = new URL(url);
    } catch {
        return; // URL inválida, ignorar
    }
    
    let hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    
    // Detectar servicio
    let endpoint = null;
    
    // Búsqueda exacta
    if (serviceMap[hostname]) {
        endpoint = serviceMap[hostname];
    } else {
        // Búsqueda parcial para subdominios
        for (const [domain, ep] of Object.entries(serviceMap)) {
            if (hostname.endsWith('.' + domain) || hostname === domain) {
                endpoint = ep;
                break;
            }
        }
    }
    
    if (!endpoint) {
        return; // Servicio no soportado, ignorar silenciosamente
    }
    
    // Construir URL de la API con parámetros correctos (GET con query params)
    let apiUrl = `${API_BASE}${endpoint}?key=${encodeURIComponent(API_KEY)}&url=${encodeURIComponent(url)}`;
    
    console.log(`[DOWNLOAD] API: ${apiUrl}`);
    
    try {
        let res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        let json = await res.json();
        
        if (!res.ok || !json.status || !json.data) {
            console.log(`[DOWNLOAD] Error API ${endpoint}:`, json.message || json);
            return; // Error, ignorar silenciosamente
        }
        
        let data = json.data;
        let downloadUrl = null;
        let filename = 'download';
        let isAudio = audioOnlyServices.includes(endpoint);
        
        // Caso 1: data es array (ej. Instagram con múltiples medios)
        if (Array.isArray(data)) {
            for (let item of data) {
                downloadUrl = item.url || item.download_url;
                if (downloadUrl) {
                    if (item.type === 'audio') isAudio = true;
                    filename = item.filename || `download_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
                    await conn.sendFile(m.chat, downloadUrl, filename, '', m);
                }
            }
            return;
        }
        
        // Caso 2: data es objeto
        if (typeof data === 'object') {
            downloadUrl = data.download_url || data.url || data.dl_url || data.link;
            filename = data.filename || `download_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;
            
            // Si hay múltiples calidades, priorizar HD o la primera disponible
            if (!downloadUrl && (data.hd || data.sd || data.no_watermark)) {
                downloadUrl = data.hd || data.sd || data.no_watermark;
            }
        }
        
        if (!downloadUrl) {
            console.log(`[DOWNLOAD] No se encontró URL en:`, data);
            return;
        }
        
        console.log(`[DOWNLOAD] Enviando: ${downloadUrl}`);
        await conn.sendFile(m.chat, downloadUrl, filename, '', m);
        
    } catch (error) {
        console.log(`[DOWNLOAD ERROR] ${endpoint}:`, error.message);
        // Ignorar errores silenciosamente
    }
}

export default {
    name: 'download',
    // Función match para detectar URLs automáticamente
    match: (text, ctx) => {
        if (!text) return false;
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/i;
        return urlRegex.test(text);
    },
    
    // Función execute que llama al procesador
    execute: async ({ sock, msg }) => {
        await processDownload(msg, sock);
    }
};
