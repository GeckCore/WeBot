import fetch from 'node-fetch';

export default {
    name: 'download',
    
    // Match: Solo reacciona si hay una URL en el mensaje Y el remitente es el propietario
    match: (text, ctx) => {
        if (!text || !text.trim()) return false;
        
        // Verificar si hay una URL
        let urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)|(www\.[^\s<>"{}|\\^`\[\]]+)/gi;
        if (!urlRegex.test(text)) return false;
        
        // Solo ejecutar si es el propietario
        return ctx && ctx.isOwner === true;
    },
    
    execute: async ({ sock, remitente, textoLimpio, isOwner }) => {
        // Doble verificación de propietario
        if (!isOwner) return;
        
        if (!textoLimpio || !textoLimpio.trim()) return;
        
        // Extraer URL del mensaje
        let urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)|(www\.[^\s<>"{}|\\^`\[\]]+)/gi;
        let match = textoLimpio.match(urlRegex);
        
        if (!match) return;
        
        let url = match[0].trim();
        
        await processDownload(sock, remitente, url);
    }
};

const API_BASE = 'https://api.evogb.org';
const API_KEY = 'geckcore';

const serviceMap = {
    'instagram.com': '/dl/instagram',
    'instagr.am': '/dl/instagram',
    'mediafire.com': '/dl/mediafire',
    'pinterest.com': '/dl/pinterest',
    'pin.it': '/dl/pinterest',
    'soundcloud.com': '/dl/soundcloud',
    'on.soundcloud.com': '/dl/soundcloud',
    'spotify.com': '/dl/spotify',
    'open.spotify.com': '/dl/spotify',
    'terabox.com': '/dl/terabox',
    '1024tera.com': '/dl/terabox',
    'threads.net': '/dl/threads',
    'tiktok.com': '/dl/tiktok',
    'vm.tiktok.com': '/dl/tiktok',
    'vt.tiktok.com': '/dl/tiktok',
    'twitter.com': '/dl/twitter',
    'x.com': '/dl/twitter',
    'youtube.com': '/dl/youtube',
    'youtu.be': '/dl/youtube',
};

const audioOnlyServices = ['/dl/tiktokmp3', '/dl/ytmp3'];

async function processDownload(sock, remitente, url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return;
    }
    
    let hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    let endpoint = null;
    
    if (serviceMap[hostname]) {
        endpoint = serviceMap[hostname];
    } else {
        for (const [domain, ep] of Object.entries(serviceMap)) {
            if (hostname.endsWith('.' + domain) || hostname === domain) {
                endpoint = ep;
                break;
            }
        }
    }
    
    if (!endpoint) return;
    
    let apiUrl = `${API_BASE}${endpoint}?key=${encodeURIComponent(API_KEY)}&url=${encodeURIComponent(url)}`;
    
    try {
        await sock.sendMessage(remitente, { text: '📥 Descargando...' });
        
        let res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        let json = await res.json();
        
        if (!res.ok || !json.status || !json.data) {
            await sock.sendMessage(remitente, { text: `❌ Error: ${json.message || 'Enlace inválido o contenido eliminado'}` });
            return;
        }
        
        let data = json.data;
        let isAudio = audioOnlyServices.includes(endpoint);
        
        // Caso 1: data es array
        if (Array.isArray(data)) {
            for (let item of data) {
                let downloadUrl = item.url || item.download_url;
                if (downloadUrl) {
                    let fileIsAudio = item.type === 'audio' || isAudio;
                    let ext = fileIsAudio ? 'mp3' : 'mp4';
                    let filename = item.filename || `download_${Date.now()}.${ext}`;
                    await sock.sendFile(remitente, downloadUrl, filename, '', null);
                }
            }
            return;
        }
        
        // Caso 2: data es objeto
        if (typeof data === 'object') {
            let downloadUrl = data.download_url || data.url || data.dl_url || data.link;
            
            if (!downloadUrl && (data.hd || data.sd || data.no_watermark)) {
                downloadUrl = data.hd || data.sd || data.no_watermark;
            }
            
            if (!downloadUrl) {
                // Buscar cualquier URL en el objeto
                for (let key of Object.keys(data)) {
                    if (typeof data[key] === 'string' && data[key].startsWith('http')) {
                        downloadUrl = data[key];
                        break;
                    }
                }
            }
            
            if (downloadUrl) {
                let ext = isAudio ? 'mp3' : 'mp4';
                let filename = data.filename || `download_${Date.now()}.${ext}`;
                await sock.sendFile(remitente, downloadUrl, filename, '', null);
            } else {
                await sock.sendMessage(remitente, { text: '❌ No se encontró enlace de descarga' });
            }
        }
        
    } catch (error) {
        console.error(`[DOWNLOAD ERROR]:`, error.message);
        await sock.sendMessage(remitente, { text: `❌ Error: ${error.message}` });
    }
}
