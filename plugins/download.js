import fetch from 'node-fetch';

let handler = async (m, { conn, usedPrefix, command }) => {
    // 1. OBTENER TEXTO DEL MENSAJE
    let text = m.text ? m.text.trim() : '';
    
    // Si no hay texto, ignorar silenciosamente
    if (!text) return;

    // 2. DETECCIÓN DE ENLACE (El "prefijo" implícito es http/https/www)
    let urlRegex = /(https?:\/\/[^\s<>\"{}|\\^`\[\]]+)|(www\.[^\s<>\"{}|\\^`\[\]]+)/gi;
    let match = text.match(urlRegex);
    
    // Si no hay URL en el mensaje, este plugin NO hace nada
    if (!match) return;

    let url = match[0];

    // 3. VERIFICACIÓN ESTRICTA DE PROPIETARIO
    // Solo el propietario puede usar esta función
    let ownerNumbers = global.owner || [];
    let isOwner = false;
    
    if (Array.isArray(ownerNumbers)) {
        isOwner = ownerNumbers.some(num => {
            let n = typeof num === 'object' ? num[0] : num;
            return m.sender.includes(n.replace(/[^0-9]/g, ''));
        });
    }
    
    // También verificar si es el propio bot o modo self
    if (m.sender === conn.user.jid) isOwner = true;
    if (global.opts && global.opts['self']) isOwner = true;
    
    // Si NO es el propietario, IGNORAR COMPLETAMENTE (sin logs, sin respuesta)
    if (!isOwner) return;

    // 4. PROCESAR DESCARGA
    await processDownload(m, conn, url);
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

async function processDownload(m, conn, url) {
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
        await m.reply(`📥 Descargando...`);
        
        let res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        let json = await res.json();
        
        if (!res.ok || !json.status || !json.data) {
            await m.reply(`❌ Error: ${json.message || 'Enlace inválido o contenido eliminado'}`);
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
                    await conn.sendFile(m.chat, downloadUrl, filename, '', m);
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
                await conn.sendFile(m.chat, downloadUrl, filename, '', m);
            } else {
                await m.reply('❌ No se encontró enlace de descarga');
            }
        }
        
    } catch (error) {
        console.error(`[DOWNLOAD ERROR]:`, error.message);
        await m.reply(`❌ Error: ${error.message}`);
    }
}

handler.help = ['(link)'];
handler.tags = ['downloader'];
handler.command = /^$/; // Se activa por contenido (URL), no por comando
handler.exp = 0;
handler.limit = false;

export default handler;
