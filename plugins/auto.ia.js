import { GoogleGenerativeAI } from '@google/generative-ai';

global.autoIaTargets = global.autoIaTargets || {};

// ⚠️ TU CLAVE AQUÍ
const GEMINI_API_KEY = "TU_NUEVA_API_KEY_AQUI"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default {
    name: 'auto_ia_responder_v2',
    match: (text, ctx) => {
        if (ctx.msg.key.fromMe && /^\.autoia/i.test(text)) return true;
        if (global.autoIaTargets[ctx.remitente] && !ctx.msg.key.fromMe) return true;
        return false;
    },
    
    execute: async ({ sock, remitente, msg, textoLimpio }) => {

        // --- FASE 1: CONTROL ---
        if (msg.key.fromMe && /^\.autoia/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            const args = textoLimpio.replace(/^\.autoia/i, '').trim();

            if (args.toLowerCase() === 'off') {
                delete global.autoIaTargets[remitente];
                return sock.sendMessage(remitente, { text: '🛑 *GECKCORE // AUTO-IA OFF*' });
            }

            if (!args) return sock.sendMessage(remitente, { text: '⚠️ *ERROR:* Define un contexto.' });

            global.autoIaTargets[remitente] = { perfil: args, historial: [] };
            return sock.sendMessage(remitente, { text: `🤖 *GECKCORE // AUTO-IA ON*\n> Perfil: _${args}_` });
        }

        // --- FASE 2: INTERCEPCIÓN ---
        if (global.autoIaTargets[remitente] && !msg.key.fromMe && textoLimpio) {
            const config = global.autoIaTargets[remitente];

            try {
                await sock.sendPresenceUpdate('composing', remitente);
                config.historial.push({ role: 'user', parts: [{ text: textoLimpio }] });

                let safeHistory = [];
                let lastRole = null;
                for (const item of config.historial) {
                    if (item.role === lastRole) {
                        safeHistory[safeHistory.length - 1].parts[0].text += `\n${item.parts[0].text}`;
                    } else {
                        safeHistory.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
                        lastRole = item.role;
                    }
                }

                const promptActual = safeHistory.pop().parts[0].text;
                const model = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: `Eres un chaval español de 17 años hablando por WhatsApp.
CONTACTO: ${config.perfil}
REGLAS: Humano, respuestas secas de 1-3 líneas, español de España, nada de asteriscos ni saludos de IA.`
                });

                const chat = model.startChat({
                    history: safeHistory,
                    generationConfig: { temperature: 0.65, maxOutputTokens: 150 }
                });

                // --- SISTEMA DE RESILIENCIA GECKCORE ---
                let result;
                let intentos = 5; // Subimos a 5 intentos
                let exito = false;

                while (intentos > 0 && !exito) {
                    try {
                        result = await chat.sendMessage(promptActual);
                        exito = true;
                    } catch (err) {
                        if (err.status === 503 || err.status === 429) {
                            intentos--;
                            console.log(`[!] Google saturado. Reintento ${5 - intentos}/5 en 5s...`);
                            if (intentos > 0) await new Promise(r => setTimeout(r, 5000)); // Espera 5 segundos
                        } else {
                            throw err; 
                        }
                    }
                }

                if (!exito) throw new Error("GOOGLE_SATURED_ABORT");

                let responseText = result.response.text().trim();
                responseText = responseText.replace(/\*/g, '').replace(/^(hola|buenas).*/i, '').trim();

                config.historial.push({ role: 'model', parts: [{ text: responseText }] });
                if (config.historial.length > 20) config.historial = config.historial.slice(-20);

                const typingTime = Math.min(responseText.length * 45 + 1500, 8000);
                await new Promise(r => setTimeout(r, typingTime));

                await sock.sendPresenceUpdate('paused', remitente);
                await sock.sendMessage(remitente, { text: responseText });

            } catch (e) {
                console.error('[AUTO-IA ERROR]:', e.message);
                await sock.sendPresenceUpdate('paused', remitente);
                
                if (e.message?.includes('API key not valid')) {
                    await sock.sendMessage(remitente, { text: '❌ API KEY INVÁLIDA.' });
                    delete global.autoIaTargets[remitente];
                }
                // Si fallan los 5 reintentos, el bot simplemente no contesta este mensaje para no delatarse.
            }
        }
    }
};
