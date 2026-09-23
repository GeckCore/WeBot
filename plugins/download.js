import fetch from 'node-fetch';

const handler = async (ctx) => {
  const { sock, msg, remitente, textoLimpio, quoted, senderJid, ownerId } = ctx;
  
  // 1. Obtener el texto del mensaje
  let text = textoLimpio || '';
  
  // 2. Detectar URLs (http, https, www)
  let urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  let urls = text.match(urlRegex);
  
  if (!urls || urls.length === 0) return; // No hay links, ignorar
  
  let url = urls[0]; // Tomar el primer link encontrado
  
  // 3. Verificar si es el propietario
  let ownerNumber = ownerId ? ownerId.split('@')[0] : '';
  
  if (senderJid !== ownerNumber.replace(/[^0-9]/g, '')) {
    return; // Ignorar silenciosamente si no es el dueño
  }

  // 4. Determinar el tipo de servicio y endpoint
  let endpoint = null;
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) endpoint = 'dl-instagram';
  else if (lowerUrl.includes('tiktok.com')) endpoint = 'dl-tiktok';
  else if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) endpoint = 'dl-youtubeplay';
  else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) endpoint = 'dl-twitter';
  else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) endpoint = 'dl-facebook';
  else if (lowerUrl.includes('pinterest.com')) endpoint = 'dl-pinterest';
  else if (lowerUrl.includes('soundcloud.com')) endpoint = 'dl-soundcloud';
  else if (lowerUrl.includes('spotify.com')) endpoint = 'dl-spotify';
  else if (lowerUrl.includes('mediafire.com')) endpoint = 'dl-mediafire';
  else if (lowerUrl.includes('terabox.com') || lowerUrl.includes('teraboxapp.com')) endpoint = 'dl-terabox';
  else if (lowerUrl.includes('threads.net')) endpoint = 'dl-threads';
  
  // Si no es un link soportado por nuestra API, ignorar
  if (!endpoint) return;

  // 5. Notificar que está procesando
  await sock.sendMessage(remitente, { text: '📥 Descargando...' }, { quoted: msg });

  try {
    // 6. Llamar a la API
    const apiKey = 'geckcore';
    const apiUrl = `https://api.evogb.org/${endpoint}?key=${apiKey}&url=${encodeURIComponent(url)}`;
    
    const response = await fetch(apiUrl);
    const data = await response.json();

    // 7. Validar respuesta de la API
    if (!data.status || !data.data) {
      throw new Error(data.message || 'Error desconocido de la API');
    }

    // 8. Procesar datos según estructura de respuesta (puede variar ligeramente por endpoint)
    let mediaUrl = null;
    let type = 'video'; // Default
    
    // Manejo de estructuras comunes en esta API
    if (Array.isArray(data.data)) {
      // Caso Instagram/TikTok a veces devuelve array
      mediaUrl = data.data[0].url || data.data[0].download_url;
      if (data.data[0].type === 'audio' || data.data[0].type === 'music') type = 'audio';
    } else if (typeof data.data === 'object') {
      // Caso YouTube/Spotify/Mediafire devuelve objeto directo
      mediaUrl = data.data.url || data.data.download_url || data.data.audio || data.data.video;
      
      if (data.data.type === 'audio' || endpoint.includes('mp3') || endpoint.includes('soundcloud') || endpoint.includes('spotify')) {
        type = 'audio';
      } else if (data.data.type === 'image') {
        type = 'image';
      }
    }

    if (!mediaUrl) throw new Error('No se encontró el enlace de descarga en la respuesta');

    // 9. Enviar el archivo
    let messageOptions = {};
    
    if (type === 'audio') {
      messageOptions = { audio: { url: mediaUrl }, mimetype: 'audio/mpeg', fileName: 'audio.mp3' };
    } else if (type === 'image') {
      messageOptions = { image: { url: mediaUrl }, caption: '✅ Aquí tienes tu imagen' };
    } else {
      // Video por defecto
      messageOptions = { video: { url: mediaUrl }, mimetype: 'video/mp4', caption: '✅ Aquí tienes tu video' };
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
