import { GoogleGenerativeAI } from '@google/generative-ai';

// NUNCA pongas la clave aquí directamente. Lo ideal es usar process.env.GEMINI_API_KEY
// Pero por ahora, pon tu NUEVA clave aquí sin compartirla.
const GEMINI_API_KEY = "PON_TU_NUEVA_CLAVE_AQUI"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: `Tu objetivo es responder a los mensajes de WhatsApp como si fueras el usuario real porque él no tiene tiempo.
    REGLAS ESTRICTAS:
    1. Prohibido saludar (nada de "hola", "qué tal").
    2. Prohibido sonar como IA o asistente virtual.
    3. Respuestas muy cortas (1 a 3 líneas máximo), directas al grano.
    4. Usa un tono informal, seco y un poco sarcástico si la situación lo requiere.
    5. Nunca te disculpes ni des explicaciones largas.
    6. Lee el contexto de la conversación y responde a lo último que te dijeron de forma natural.`
});

export default {
    name: 'delegar_ia',
    match: (text) => /^\.ia$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // Borramos tu comando para mantener el sigilo
        try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        const history = global.chatHistory?.get(remitente) || [];
        
        if (history.length < 1) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ RAM vacía. No hay contexto previo para responder.' 
            });
        }

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // SANITIZACIÓN DEL HISTORIAL (Crucial para que la API no crashee)
            // Gemini exige que el historial alterne estrictamente [user, model, user, model...]
            // y que el último mensaje (el actual) NO esté en el history, sino que se envíe en sendMessage.
            
            let contextMessages = [];
            let lastRole = null;

            // Recorremos el historial filtrando mensajes vacíos y agrupando roles consecutivos
            for (const item of history) {
                if (!item.parts[0].text) continue;
                
                // Si el rol es el mismo que el anterior, concatenamos el texto en lugar de crear un nuevo turno (evita crasheos)
                if (item.role === lastRole) {
                    contextMessages[contextMessages.length - 1].parts[0].text += `\n${item.parts[0].text}`;
                } else {
                    contextMessages.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
                    lastRole = item.role;
                }
            }

            // Extraemos el ÚLTIMO mensaje (que siempre debe ser 'user') para usarlo como el prompt actual
            // Si el último mensaje es tuyo ('model'), la IA no tiene a qué responder.
            if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1].role !== 'user') {
                await sock.sendPresenceUpdate('paused', remitente);
                return sock.sendMessage(remitente, { text: '⚠️ El último mensaje es tuyo, la IA no sabe a qué responder.' });
            }

            const promptActual = contextMessages.pop().parts[0].text;

            // Iniciamos el chat con el historial sanitizado
            const chat = model.startChat({
                history: contextMessages,
                generationConfig: {
                    temperature: 0.6, // Bajado un poco de 0.7 a 0.6 para respuestas más secas/reales
                    maxOutputTokens: 150,
                }
            });

            // Enviamos el último mensaje del usuario
            const result = await chat.sendMessage(promptActual);
            const responseText = result.response.text().trim();

            await sock.sendPresenceUpdate('paused', remitente);
            await sock.sendMessage(remitente, { text: responseText }, { quoted: msg });

            // Inyectamos la respuesta en tu memoria RAM global
            // Asegúrate de que history es manipulable (pasado por referencia)
            history.push({ role: 'model', parts: [{ text: responseText }] });
            if (history.length > 25) history.shift();

        } catch (e) {
            console.error('[PLUGIN IA ERROR]:', e);
            await sock.sendPresenceUpdate('paused', remitente);
            
            // Filtro rápido para saber si falló por la API Key
            if (e.message?.includes('API key not valid')) {
                await sock.sendMessage(remitente, { text: '❌ Error: API Key inválida o revocada.' });
            } else {
                await sock.sendMessage(remitente, { text: '❌ Error de procesamiento interno.' });
            }
        }
    }
};
