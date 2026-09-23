// plugins/ai.js — Comando .ai (Gemini vía API EvoGB)
// Uso: .ai <texto>   |   .ai (respondiendo a un mensaje con texto)

const API_KEY = 'geckcore';
const API_URL = 'https://api.evogb.org/ai/gemini';

// Personalidad del asistente (prompt interno)
const SYSTEM_PROMPT = "Eres mi asistente personal de WhatsApp. Responde SIEMPRE como un humano real escribiendo por chat: natural, casual y directo, sin sonar a asistente de IA ni a robot. No uses listas numeradas ni formato markdown (**, ##, etc.), escribe texto plano con saltos de línea si hace falta. No empieces con frases robóticas tipo '¡Hola! Claro que sí'. No menciones que eres una IA ni Gemini. Si no sabes algo, dilo de forma natural. Usa emojis con moderación. Responde en el mismo idioma que use el usuario. Sé breve salvo que te pidan detalle.";

// Extrae el texto legible de un mensaje citado (quotedMessage)
const getQuotedText = (quoted) => {
  if (!quoted) return '';
  return (
    quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    quoted.imageMessage?.caption ||
    quoted.videoMessage?.caption ||
    ''
  ).trim();
};

export default {
  name: 'ai',
  match: (text) => /^\.ai(\s|$)/i.test((text || '').trim()),

  execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
    // 1. Texto después del comando
    let texto = textoLimpio.replace(/^\.ai\s*/i, '').trim();

    // 2. Si no hay texto, intentar usar el texto del mensaje respondido
    if (!texto && quoted) {
      texto = getQuotedText(quoted);
    }

    if (!texto) {
      return sock.sendMessage(remitente, {
        text: '⚠️ *Uso:*\n.ai tu pregunta\n_o responde a un mensaje con_ .ai'
      }, { quoted: msg });
    }

    try {
      await sock.sendPresenceUpdate('composing', remitente);

      const url = `${API_URL}?key=${API_KEY}&text=${encodeURIComponent(texto)}&prompt=${encodeURIComponent(SYSTEM_PROMPT)}`;
      console.log('[AI] Consultando Gemini...');

      const res = await fetch(url);
      const raw = await res.text();

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error('[AI] Respuesta no JSON:', raw.substring(0, 200));
        throw new Error('La API devolvió una respuesta inválida.');
      }

      if (!data.status || !data.result) {
        throw new Error(data.message || 'La IA no devolvió resultado.');
      }

      // Limpiar restos de markdown que la IA pueda colar
      let respuesta = String(data.result)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/^#+\s*/gm, '')
        .trim();

      await sock.sendMessage(remitente, { text: respuesta }, { quoted: msg });
    } catch (err) {
      console.error('[AI ERROR]:', err.message);
      await sock.sendMessage(remitente, { text: `❌ Error: ${err.message}` });
    }
  }
};
