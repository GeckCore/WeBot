import fetch from 'node-fetch';

const handler = async (ctx) => {
  const { sock, msg, remitente, textoLimpio, quoted, senderJid, ownerId, isOwner } = ctx;
  
  // 1. Obtener el texto del mensaje
  let text = textoLimpio || '';
  
  // 2. Detectar URLs (http, https, www)
  let urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  let urls = text.match(urlRegex);
  
  if (!urls || urls.length === 0) return; // No hay links, ignorar
  
  let url = urls[0]; // Tomar el primer link encontrado
  
  // 3. Verificar si es el propietario (usando isOwner del contexto)
  if (!isOwner) {
    return; // Ignorar silenciosamente si no es el dueño
  }

  // 4. Determinar el tipo de servicio y endpoint según API EvoGB
  let endpoint = null;
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) endpoint = 'dl/instagram';
  else if (lowerUrl.includes('tiktok.com')) endpoint = 'dl/tiktok';
  else if (lowerUrl.includes('youtube.com/watch') || lowerUrl.includes('youtu.be/')) {
    // YouTube video normal
    endpoint = 'dl/youtubeplay';
  } else if (lowerUrl.includes('music.youtube.com')) {
    // YouTube Music - usar ytmp3
    endpoint = 'dl/ytmp3';
  } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) endpoint = 'dl/twitter';
  else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) endpoint = 'dl/facebook';
  else if (lowerUrl.includes('pinterest.com')) endpoint = 'dl/pinterest';
  else if (lowerUrl.includes('soundcloud.com')) endpoint = 'dl/soundcloud';
  else if (lowerUrl.includes('spotify.com')) endpoint = 'dl/spotify';
  else if (lowerUrl.includes('mediafire.com')) endpoint = 'dl/mediafire';
  else if (lowerUrl.includes('terabox.com') || lowerUrl.includes('teraboxapp.com')) endpoint = 'dl/terabox';
  else if (lowerUrl.includes('threads.net')) endpoint = 'dl/threads';
  
  // Si no es un link soportado por nuestra API, ignorar
  if (!endpoint) return;

  // 5. Notificar que está procesando
  await sock.sendMessage(remitente, { text: '📥 Descargando...' }, { quoted: msg });

  try {
    // 6. Llamar a la API
    const apiKey = 'geckcore';
    const apiUrl = `https://api.evogb.org/${endpoint}?key=${apiKey}&url=${encodeURIComponent(url)}`;
    
    console.log('[DOWNLOAD] Llamando a API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const responseText = await response.text();
    console.log('[DOWNLOAD] Respuesta API status:', response.status);
    console.log('[DOWNLOAD] Respuesta API body:', responseText.substring(0, 500));
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[DOWNLOAD] Error parseando JSON:', parseError.message);
      throw new Error('La API no devolvió un JSON válido. Puede estar en mantenimiento.');
    }

    // 7. Validar respuesta de la API
    if (!data || !data.status) {
      throw new Error(data?.message || data?.error || 'Error desconocido de la API');
    }
    
    if (!data.data) {
      throw new Error('No hay datos en la respuesta de la API');
    }

    // 8. Procesar datos según estructura de respuesta de EvoGB API
    let mediaUrl = null;
    let type = 'video'; // Default
    let filename = 'archivo';
    
    // La API EvoGB devuelve: { status, creator, data: { download_url, filename } }
    if (typeof data.data === 'object' && data.data !== null) {
      mediaUrl = data.data.download_url || data.data.url || data.data.audio || data.data.video;
      filename = data.data.filename || 'archivo';
      
      // Determinar tipo según endpoint o datos
      if (endpoint.includes('/ytmp3') || endpoint.includes('/soundcloud') || endpoint.includes('/spotify') || 
          (data.data.type && data.data.type === 'audio')) {
        type = 'audio';
      } else if (endpoint.includes('/instagram') && data.data.type === 'image') {
        type = 'image';
      } else if (data.data.type === 'image') {
        type = 'image';
      }
    }

    if (!mediaUrl) {
      console.error('[DOWNLOAD] No se encontró URL en la respuesta:', JSON.stringify(data));
      throw new Error('No se encontró el enlace de descarga en la respuesta');
    }

    // 9. Enviar el archivo
    let messageOptions = {};
    
    if (type === 'audio') {
      messageOptions = { 
        audio: { url: mediaUrl }, 
        mimetype: 'audio/mpeg', 
        fileName: filename.endsWith('.mp3') ? filename : `${filename}.mp3` 
      };
    } else if (type === 'image') {
      messageOptions = { 
        image: { url: mediaUrl }, 
        caption: '✅ Aquí tienes tu imagen' 
      };
    } else {
      // Video por defecto
      messageOptions = { 
        video: { url: mediaUrl }, 
        mimetype: 'video/mp4', 
        caption: '✅ Aquí tienes tu video',
        fileName: filename.endsWith('.mp4') ? filename : `${filename}.mp4`
      };
    }

    await sock.sendMessage(remitente, messageOptions, { quoted: msg });

  } catch (error) {
    console.error('[DOWNLOAD ERROR]:', error);
    await sock.sendMessage(remitente, { text: `❌ Error: ${error.message}` }, { quoted: msg });
  }
};

// Configuración del handler para el nuevo sistema de plugins
export const match = (text, ctx) => {
  // Solo ejecutar si hay un enlace en el mensaje
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  return urlRegex.test(text);
};

export const execute = handler;
export default { match, execute };
