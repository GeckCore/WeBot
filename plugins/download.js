import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración
const API_KEY = 'geckcore';
const API_BASE = 'https://api.evogb.org';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mapeo de dominios a endpoints de la API
const SERVICES = {
    'instagram.com': '/dl/instagram',
    'instagr.am': '/dl/instagram',
    'tiktok.com': '/dl/tiktok',
    'vm.tiktok.com': '/dl/tiktok',
    'vt.tiktok.com': '/dl/tiktok',
    'youtube.com': '/dl/ytmp4',
    'youtu.be': '/dl/ytmp4',
    'music.youtube.com': '/dl/ytmp4', // Redirigimos a video o podrías usar ytmp3
    'twitter.com': '/dl/twitter',
    'x.com': '/dl/twitter',
    'facebook.com': '/dl/facebook',
    'fb.watch': '/dl/facebook',
    'pinterest.com': '/dl/pinterest',
    'pin.it': '/dl/pinterest',
    'soundcloud.com': '/dl/soundcloud',
    'spotify.com': '/dl/spotify',
    'mediafire.com': '/dl/mediafire',
    'terabox.com': '/dl/terabox',
    '1024tera.com': '/dl/terabox',
    'threads.net': '/dl/threads'
};

// Función auxiliar para detectar servicio
function getService(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        // Casos especiales para MP3
        if (url.includes('spotify.com') || url.includes('open.spotify.com')) return { endpoint: '/dl/spotify', type: 'audio' };
        if (url.includes('soundcloud.com')) return { endpoint: '/dl/soundcloud', type: 'audio' };
        if (url.includes('music.youtube.com') && (url.includes('list=') || !url.includes('watch'))) return { endpoint: '/dl/youtubeplay-private', type: 'audio' }; // Intento para playlists o música
        if (url.match(/(youtube\.com|youtu\.be)/) && url.includes('&list=')) return { endpoint: '/dl/youtubeplay-private', type: 'audio' };
        
        // Detección normal
        for (const [key, endpoint] of Object.entries(SERVICES)) {
            if (domain.includes(key)) {
                // Excepción para YouTube Music si se quiere video por defecto
                if (domain.includes('music.youtube.com') && endpoint === '/dl/ytmp4') return { endpoint, type: 'video' };
                return { endpoint, type: 'video' }; // Default video para redes sociales
            }
        }
    } catch (e) {
        return null;
    }
    return null;
}

let handler = async (m, { conn }) => {
    // 1. Verificar si es el propietario (REQUISITO OBLIGATORIO)
    // Ajusta el número si tu configuración global de owner es diferente
    const ownerNumber = global.owner ? (Array.isArray(global.owner) ? global.owner[0] : global.owner) : '';
    const sender = m.sender.split('@')[0];
    
    if (sender !== ownerNumber) {
        // Si no es el dueño, ignorar completamente (ni siquiera leer el mensaje para logs de download)
        return;
    }

    const text = m.text || '';
    
    // 2. Detectar URL en el mensaje
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex);

    if (!urls) return;

    for (const url of urls) {
        const service = getService(url);
        if (!service) continue; // Ignorar URLs no soportadas

        const { endpoint, type } = service;
        
        // Notificación de inicio
        await conn.sendMessage(m.chat, { text: '📥 Descargando...' }, { quoted: m });

        try {
            // 3. Petición a la API
            const apiUrl = `${API_BASE}${endpoint}?key=${API_KEY}&url=${encodeURIComponent(url)}`;
            
            const response = await fetch(apiUrl, {
                timeout: 30000 // 30 segundos timeout
            });

            // Validar que la respuesta sea JSON
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("La API no respondió con JSON válido (posible bloqueo o mantenimiento).");
            }

            const json = await response.json();

            if (!json.status || !json.data) {
                throw new Error(json.message || "Error desconocido de la API o contenido no disponible.");
            }

            // 4. Procesar datos según estructura de respuesta (Array u Objeto)
            let mediaUrl = null;
            let mimeType = 'application/octet-stream';
            
            if (Array.isArray(json.data)) {
                // Respuesta tipo Instagram (varios videos/fotos)
                mediaUrl = json.data[0].url;
                if (json.data[0].type === 'photo') mimeType = 'image/jpeg';
                else mimeType = 'video/mp4';
            } else if (json.data.download_url) {
                // Respuesta tipo MediaFire/TeraBox/Genérica
                mediaUrl = json.data.download_url;
            } else if (json.data.url) {
                // Respuesta directa
                mediaUrl = json.data.url;
            }

            if (!mediaUrl) throw new Error("No se encontró el enlace de descarga en la respuesta.");

            // 5. Descargar archivo temporalmente (para controlar tamaño y mimetype)
            const fileRes = await fetch(mediaUrl);
            if (!fileRes.ok) throw new Error("Error descargando el archivo desde el CDN.");
            
            const buffer = await fileRes.buffer();
            
            // Límite de seguridad (ej. 100MB)
            if (buffer.length > 100 * 1024 * 1024) {
                return conn.sendMessage(m.chat, { text: '⚠️ El archivo es demasiado grande (>100MB).' }, { quoted: m });
            }

            // 6. Enviar usando sendMessage (Método correcto para Baileys actual)
            const msgOptions = {};
            
            if (type === 'audio' || mimeType.includes('audio')) {
                msgOptions.audio = buffer;
                msgOptions.mimetype = 'audio/mp4'; // WhatsApp prefiere mp4 para audio
                msgOptions.ptt = false;
            } else if (mimeType.includes('image')) {
                msgOptions.image = buffer;
                msgOptions.caption = '✨ Aquí tienes tu imagen';
                msgOptions.mimetype = 'image/jpeg';
            } else {
                // Video por defecto
                msgOptions.video = buffer;
                msgOptions.caption = '✨ Aquí tienes tu video';
                msgOptions.mimetype = 'video/mp4';
            }

            await conn.sendMessage(m.chat, msgOptions, { quoted: m });

        } catch (error) {
            console.error(`[DOWNLOAD ERROR]: ${error.message}`);
            await conn.sendMessage(m.chat, { 
                text: `❌ Error: ${error.message}` 
            }, { quoted: m });
        }
    }
};

handler.help = ['download'];
handler.tags = ['downloader'];
handler.command = /^(download|dl)$/i; // No estrictamente necesario ya que detecta links automáticos
handler.exp = 0;

export default handler;
