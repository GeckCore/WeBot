global.autoIaTargets = global.autoIaTargets || {};

// Reemplaza esto con tu API Key real de Google AI Studio
const GEMINI_API_KEY = "TU_API_KEY_AQUI"; 
const MODEL = "gemini-1.5-flash";

export default {
    name: 'auto_gemini_responder',
    match: (text, ctx) => {
        // Intercepta el comando si es tuyo
        if (ctx.msg.key.fromMe && /^\.autoia/i.test(text)) return true;
        // Intercepta CUALQUIER mensaje entrante de un chat vigilado
        if (global.autoIaTargets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        return false;
    },
    execute: async ({ sock, msg, remitente, textoLimpio }) => {
        
        // 1. MODO COMANDO: Activar/Desactivar
        if (msg.key.fromMe && /^\.autoia/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            const args = textoLimpio.replace(/^\.autoia/i, '').trim();

            if (args.toLowerCase() === 'off') {
                delete global.autoIaTargets[remitente];
                return sock.sendMessage(remitente, { text: '🛑 *GECKCORE // AUTO-IA DESACTIVADA*' });
            }

            if (!args) {
                return sock.sendMessage(remitente, { 
                    text: '⚠️ *Falta el contexto.*\nUso: `.autoia [Personalidad/Contexto]`\nEj: `.autoia Primo pesado que siempre pide favores, trátalo mal.`' 
                });
            }

            // Inicializamos el target con su personalidad y un historial vacío
            global.autoIaTargets[remitente] = {
                perfil: args,
                historial: []
            };
            return sock.sendMessage(remitente, { text: `🤖 *GECKCORE // AUTO-IA ACTIVADA*\n> Objetivo fijado con perfil: _${args}_` });
        }

        // 2. MODO PASIVO: Intercepción y Respuesta Automática
        if (global.autoIaTargets[remitente] && !msg.key.fromMe && textoLimpio) {
            const config = global.autoIaTargets[remitente];

            // Añadimos el mensaje entrante al historial
            config.historial.push({ role: "user", parts: [{ text: textoLimpio }] });

            // Limitamos el historial a los últimos 10 turnos (ahorra tokens y evita que la IA se pierda)
            if (config.historial.length > 10) config.historial = config.historial.slice(-10);

            // Instrucciones del sistema (Hard-Prompting agresivo)
            const instrucciones = `Eres un chaval español de 17 años hablando por WhatsApp. El contacto es: ${config.perfil}.
REGLAS ESTRICTAS Y OBLIGATORIAS:
1. ERES HUMANO. NUNCA digas que eres una IA, asistente o bot.
2. HABLA EN ESPAÑOL DE ESPAÑA. Cero spanglish.
3. LENGUAJE DE WHATSAPP: Respuestas secas, directas, cortas. Cero formalidades.
4. CERO COACHISMO: No des consejos morales, no seas comprensivo si no toca.
5. ACTITUD: Sigue el rol de tu contacto. Si dice que le hables mal o seas agresivo, HAZLO sin censura.`;

            try {
                // Simulación de "Escribiendo..." nativo de WhatsApp
                await sock.sendPresenceUpdate('composing', remitente);

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
                
                const payload = {
                    system_instruction: { parts: [{ text: instrucciones }] },
                    contents: config.historial,
                    generationConfig: {
                        temperature: 0.65, // Balance entre creatividad y lógica
                        maxOutputTokens: 200 // Forza mensajes de longitud de WhatsApp
                    }
                };

                // Petición nativa Fetch (Soportado en Node 18+)
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    console.error("[AUTO-IA GEMINI ERROR]:", data);
                    await sock.sendPresenceUpdate('paused', remitente);
                    return; // Falla silencioso para no enviar códigos de error al chat
                }

                // Extracción y limpieza del mensaje
                let respuestaIA = data.candidates[0].content.parts[0].text;
                respuestaIA = respuestaIA.replace(/\*/g, '').trim(); // Limpia asteriscos de markdown que delatan a las IA
                respuestaIA = respuestaIA.replace(/^(hola|buenas).*/i, '').trim(); // Filtro anti-saludos IA

                // Añadimos la respuesta al historial para el contexto futuro
                config.historial.push({ role: "model", parts: [{ text: respuestaIA }] });

                // Retraso dinámico realista (50ms por letra + 1s base)
                const delay = Math.min(respuestaIA.length * 50 + 1000, 7000);
                await new Promise(r => setTimeout(r, delay));

                await sock.sendPresenceUpdate('paused', remitente);
                await sock.sendMessage(remitente, { text: respuestaIA });

            } catch (err) {
                console.error("[AUTO-IA CRITICAL ERROR]:", err);
                await sock.sendPresenceUpdate('paused', remitente);
            }
        }
    }
};
