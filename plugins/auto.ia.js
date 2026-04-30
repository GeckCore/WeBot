global.autoIaTargets = global.autoIaTargets || {};
global.msgQueues = global.msgQueues || {};
global.msgTimers = global.msgTimers || {};

// ⚠️ TUS CLAVES API
const OPENROUTER_API_KEY = "sk-tu-api"; 
const GROQ_API_KEY = "gsk_tu-api"; 

export default {
    name: 'auto_ia_responder_v6_bulletproof',
    match: (text, ctx) => {
        if (ctx.msg.key.fromMe && /^\.autoia/i.test(text)) return true;
        if (global.autoIaTargets[ctx.remitente] && !ctx.msg.key.fromMe) {
            if (text || ctx.msgType === 'audioMessage') return true;
        }
        return false;
    },
    
    execute: async (ctx) => {
        const { sock, remitente, msg, textoLimpio, msgType, downloadContentFromMessage } = ctx;

        // --- 1. CONTROL DE COMANDO ---
        if (msg.key.fromMe && /^\.autoia/i.test(textoLimpio)) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            const args = textoLimpio.replace(/^\.autoia/i, '').trim();

            if (args.toLowerCase() === 'off') {
                delete global.autoIaTargets[remitente];
                delete global.msgQueues[remitente];
                clearTimeout(global.msgTimers[remitente]);
                return sock.sendMessage(remitente, { text: '🛑 *OFF*' });
            }
            if (!args) return sock.sendMessage(remitente, { text: '⚠️ Contexto?' });

            global.autoIaTargets[remitente] = { perfil: args, historial: [] };
            return sock.sendMessage(remitente, { text: `🤖 *ON*\n> Perfil: _${args}_` });
        }

        // --- 2. LÓGICA DE INTERCEPCIÓN Y AUDIO ---
        if (global.autoIaTargets[remitente] && !msg.key.fromMe) {
            let contenidoUsuario = textoLimpio;

            if (msgType === 'audioMessage') {
                try {
                    await sock.sendPresenceUpdate('recording', remitente);
                    
                    const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
                    
                    const blob = new Blob([buffer], { type: 'audio/ogg' });
                    const formData = new FormData();
                    formData.append('file', blob, 'audio.ogg');
                    formData.append('model', 'whisper-large-v3');

                    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
                        body: formData
                    });

                    if (!groqRes.ok) throw new Error("Fallo en Whisper");
                    const groqData = await groqRes.json();
                    contenidoUsuario = `[Audio transcrito]: ${groqData.text}`;

                } catch (err) {
                    console.error("[AUDIO ERROR]:", err.message);
                    contenidoUsuario = "[Audio ininteligible, dile algo como 'no puedo escuchar audios ahora']";
                }
            }

            if (!contenidoUsuario) return;

            // --- 3. SISTEMA DE AGRUPACIÓN RÁPIDA (DEBOUNCE 2.5s) ---
            const textoRecortado = contenidoUsuario.substring(0, 200);

            if (!global.msgQueues[remitente]) global.msgQueues[remitente] = [];
            global.msgQueues[remitente].push(textoRecortado);

            clearTimeout(global.msgTimers[remitente]);
            await sock.sendPresenceUpdate('composing', remitente);

            global.msgTimers[remitente] = setTimeout(async () => {
                
                const mensajesJuntos = global.msgQueues[remitente].join('\n');
                delete global.msgQueues[remitente];
                
                const config = global.autoIaTargets[remitente];
                config.historial.push({ role: 'user', content: mensajesJuntos });

                let messages = [
                    { 
                        role: "system", 
                        content: `Eres un chaval de 17 años. Contexto: ${config.perfil}. 
                        REGLAS ORO: 
                        1. Responde en minúsculas, usa abreviaturas (tb, q, xq, dnd, nse).
                        2. Máximo 15 palabras.
                        3. Si te insultan, devuélvela o sé muy cortante.
                        4. Si te acusan de ser un bot o una IA, niégalo rotundamente, ríete de ellos o trátalos de locos ("q bot flipao", "tas tonto o q").` 
                    },
                    ...config.historial.slice(-6)
                ];

                let responseText = "";
                let apiSuccess = false;
                let retries = 3;

                // Bucle de reintentos robusto para la API
                while (retries > 0 && !apiSuccess) {
                    try {
                        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                "model": "deepseek/deepseek-v4-flash",
                                "messages": messages,
                                "temperature": 0.85,
                                "max_tokens": 50, 
                                "top_p": 0.9
                            })
                        });

                        if (!res.ok) {
                            const errBody = await res.text();
                            throw new Error(`HTTP ${res.status}: ${errBody}`);
                        }

                        const response = await res.json();
                        let rawContent = response.choices?.[0]?.message?.content;
                        
                        if (rawContent) {
                            responseText = rawContent.trim().toLowerCase();
                            apiSuccess = true;
                        } else {
                            throw new Error("Respuesta nula de OpenRouter");
                        }

                    } catch (err) {
                        retries--;
                        console.error(`[IA RETRY] Error: ${err.message.substring(0, 50)}... Quedan: ${retries}`);
                        if (retries > 0) await new Promise(r => setTimeout(r, 2000));
                    }
                }

                // --- FAIL-SAFE DE EMERGENCIA ---
                // Si la API falla los 3 intentos (por censura de insultos o saturación), 
                // soltamos una respuesta genérica para no quedarnos callados.
                if (!apiSuccess || !responseText) {
                    const emergencias = ["q dices", "jaja", "ok", "?", "paso", "no ralles", "q pesado", "ya", "dime"];
                    responseText = emergencias[Math.floor(Math.random() * emergencias.length)];
                    console.log("[IA FAILSAFE] API bloqueada/caída. Usando respuesta de emergencia.");
                } else {
                    // Limpieza normal si la API sí respondió
                    responseText = responseText.replace(/\*/g, '').replace(/[.!?]$/, '').replace(/^(hola|buenas).*/i, '');
                }

                if (!responseText) responseText = "ok"; // Doble seguro

                config.historial.push({ role: 'assistant', content: responseText });
                if (config.historial.length > 10) config.historial.shift();

                const delay = Math.min(responseText.length * 35 + 500, 2500);
                await new Promise(r => setTimeout(r, delay));

                await sock.sendPresenceUpdate('paused', remitente);
                await sock.sendMessage(remitente, { text: responseText });

            }, 2500); 
        }
    }
};

