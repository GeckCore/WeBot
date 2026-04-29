import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = "TU_NUEVA_API_KEY_AQUI"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
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
        try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

        const history = global.chatHistory?.get(remitente) || [];
        
        if (history.length < 1) {
            return sock.sendMessage(remitente, { text: '⚠️ RAM vacía. No hay contexto previo para responder.' });
        }

        try {
            await sock.sendPresenceUpdate('composing', remitente);
            
            let contextMessages = [];
            let lastRole = null;

            for (const item of history) {
                if (!item.parts[0].text) continue;
                if (item.role === lastRole) {
                    contextMessages[contextMessages.length - 1].parts[0].text += `\n${item.parts[0].text}`;
                } else {
                    contextMessages.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
                    lastRole = item.role;
                }
            }

            if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1].role !== 'user') {
                await sock.sendPresenceUpdate('paused', remitente);
                return sock.sendMessage(remitente, { text: '⚠️ El último mensaje es tuyo, la IA no sabe a qué responder.' });
            }

            const promptActual = contextMessages.pop().parts[0].text;

            const chat = model.startChat({
                history: contextMessages,
                generationConfig: { temperature: 0.6, maxOutputTokens: 150 }
            });

            const result = await chat.sendMessage(promptActual);
            const responseText = result.response.text().trim();

            await sock.sendPresenceUpdate('paused', remitente);
            await sock.sendMessage(remitente, { text: responseText }, { quoted: msg });

            history.push({ role: 'model', parts: [{ text: responseText }] });
            if (history.length > 25) history.shift();

        } catch (e) {
            console.error('[PLUGIN IA ERROR]:', e);
            await sock.sendPresenceUpdate('paused', remitente);
            
            if (e.message?.includes('API key not valid')) {
                await sock.sendMessage(remitente, { text: '❌ Error: API Key inválida o revocada.' });
            } else {
                await sock.sendMessage(remitente, { text: '❌ Error de procesamiento interno.' });
            }
        }
    }
};
