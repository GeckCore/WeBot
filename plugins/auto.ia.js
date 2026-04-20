import { GoogleGenerativeAI } from '@google/generative-ai';

// Configura tu API Key aquí
const genAI = new GoogleGenerativeAI("TU_API_KEY_AQUÍ");

// Usamos el modelo Flash por su velocidad y bajo coste
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: `Eres un chaval de 17 años de España. Eres directo, crítico, vas al gimnasio y usas jerga de internet sin dar cringe.
    Tu objetivo es responder a los mensajes de WhatsApp como si fueras el usuario real porque él no tiene tiempo.
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
        // 1. Verificar si hay memoria de chat
        const history = global.chatHistory?.get(remitente) || [];
        
        if (history.length < 2) {
            return sock.sendMessage(remitente, { 
                text: '⚠️ No tengo suficiente contexto en la memoria RAM para responder a esto.' 
            }, { quoted: msg });
        }

        // 2. Extraer el contexto (excluyendo el comando ".ia" actual)
        // Clonamos el array para no mutar el historial real y quitamos el último elemento
        const contextMessages = [...history].slice(0, -1);

        try {
            await sock.sendPresenceUpdate('composing', remitente);

            // 3. Crear el hilo de conversación para Gemini
            const chat = model.startChat({
                history: contextMessages,
                generationConfig: {
                    temperature: 0.7, // Balance entre creatividad y lógica
                    maxOutputTokens: 150, // Forzar respuestas cortas de chat
                }
            });

            // 4. Enviar señal de que delegamos la respuesta
            const result = await chat.sendMessage("Responde a esta conversación como si fueras yo.");
            const responseText = result.response.text().trim();

            // 5. Enviar mensaje como si fueras tú
            await sock.sendMessage(remitente, { text: responseText }, { quoted: msg });

            // 6. Inyectar la respuesta generada por la IA en el historial para no perder el hilo
            history.push({ role: 'model', parts: [{ text: responseText }] });
            if (history.length > 25) history.shift();

        } catch (e) {
            console.error('[PLUGIN IA] Error:', e);
            await sock.sendMessage(remitente, { text: '❌ Error al procesar la respuesta. Revisa la consola o la cuota de la API.' }, { quoted: msg });
        }
    }
};
