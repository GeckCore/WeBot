// plugins/val.js — Chat con personaje IA (FMAheart)
// Activación: .bot <texto>  (alias: .val)
// Diagnóstico: .bot ping | .bot health | .bot estado

// ══════════════════════════════════════════════════════
// SI NO VES ESTOS LOGS AL ARRANCAR EL BOT, EL ARCHIVO
// NO SE ESTÁ CARGANDO (nombre, carpeta o import roto)
// ══════════════════════════════════════════════════════
console.log('╔════════════════════════════════════════════════╗');
console.log('║ [bot] 🔌 CARGANDO plugins/val.js               ║');
console.log('╚════════════════════════════════════════════════╝');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const RAW = (process.env.FMA_API_URL || process.env.VAL_API_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const CHAT_URL   = RAW.endsWith('/api/v1/chat') ? RAW : `${RAW}/api/v1/chat`;
const BASE       = RAW.replace(/\/api\/v1\/chat$/, '');
const HEALTH_URL = `${BASE}/healthz`;
const ESTADO_URL = `${BASE}/api/v1/estado`;
const API_KEY    = process.env.FMA_API_KEY || process.env.VAL_API_KEY || '';
const TIMEOUT    = 90_000;

console.log('[bot] 📍 Base URL:', BASE);
console.log('[bot] 📍 Chat URL:', CHAT_URL);
console.log('[bot] 🔑 API Key:', API_KEY ? `✓ presente (...${API_KEY.slice(-4)})` : '✗ FALTA FMA_API_KEY');
console.log('[bot] ✅ plugins/val.js LISTO');

// ─── Cache de citas ─────────────────────────────────
const externalMsgs = new Map();
function remember(id, data) {
    if (!id) return;
    externalMsgs.set(String(id), data);
    if (externalMsgs.size > 500) externalMsgs.delete(externalMsgs.keys().next().value);
}

// ─── Utilidades ─────────────────────────────────────
function unwrap(m) {
    return m?.viewOnceMessageV2?.message || m?.viewOnceMessage?.message
        || m?.viewOnceMessageV2Extension?.message || m;
}
function extractText(m) {
    const i = unwrap(m); if (!i) return '';
    return String(i.conversation || i.extendedTextMessage?.text
        || i.imageMessage?.caption || i.videoMessage?.caption || '').trim();
}
function extractImage(m) { return unwrap(m)?.imageMessage || null; }
function sanitize(t) { return String(t || '').replace(/https?:\/\/\S+/gi, '[enlace]'); }

async function imageToDataUrl(imageMsg, dlFn) {
    if (!imageMsg || !dlFn) return null;
    try {
        const stream = await dlFn(imageMsg, 'image');
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const mime = imageMsg.mimetype || 'image/jpeg';
        return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
    } catch (e) {
        console.error('[bot] imagen falló:', e.message);
        return null;
    }
}

// ─── Plugin ─────────────────────────────────────────
export default {
    name: 'bot',
    match: (text) => {
        try {
            const t = String(text || '').trim();
            const ok = /^\.(bot|val)(\s+|$)/i.test(t);
            if (ok) console.log('[bot] ✓ MATCH:', JSON.stringify(t.substring(0, 60)));
            return ok;
        } catch { return false; }
    },

    execute: async (ctx) => {
        console.log('[bot] 🚀 execute() INICIADO');

        const { sock, remitente, msg, textoLimpio,
                downloadContentFromMessage: dlFn } = ctx || {};

        if (!sock || !remitente || !msg) {
            console.error('[bot] ❌ Faltan params:', {
                sock: !!sock, remitente: !!remitente, msg: !!msg
            });
            return;
        }
        if (!API_KEY) {
            try { await sock.sendMessage(remitente,
                { text: '❌ Falta FMA_API_KEY en el servidor.' }, { quoted: msg }); } catch {}
            return;
        }

        const send = async (text, extra) => {
            try { await sock.sendMessage(remitente,
                { text: sanitize(text), ...(extra || {}) }, { quoted: msg }); }
            catch (e) { console.error('[bot] sendMessage falló:', e.message); }
        };

        try {
            const raw = String(textoLimpio || '').replace(/^\.(bot|val)\s*/i, '').trim();
            console.log('[bot] 📝 arg:', JSON.stringify(raw.substring(0, 100)));

            // ─── Comandos de diagnóstico ─────────────
            if (/^ping$/i.test(raw)) {
                return send(`🏓 pong\nPlugin: ✓ cargado\nURL: ${BASE}\nKey: ${API_KEY ? '✓' : '✗'}`);
            }

            if (/^health$/i.test(raw)) {
                try {
                    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
                    const t = await r.text();
                    return send(`🩺 health ${r.status}\n${t.substring(0, 300)}`);
                } catch (e) {
                    return send(`🩺 health FALLÓ: ${e.message}\n\n💡 ¿Panel abierto? ¿cloudflared activo?`);
                }
            }

            if (/^estado$/i.test(raw)) {
                try {
                    const r = await fetch(ESTADO_URL, {
                        headers: { Authorization: `Bearer ${API_KEY}` },
                        signal: AbortSignal.timeout(8000)
                    });
                    const t = await r.text();
                    return send(`📊 estado ${r.status}\n${t.substring(0, 400)}`);
                } catch (e) {
                    return send(`📊 estado FALLÓ: ${e.message}`);
                }
            }

            // ─── Chat normal ─────────────────────────
            const userText = raw;
            const ctxInfo =
                msg.message?.extendedTextMessage?.contextInfo
                || msg.message?.imageMessage?.contextInfo
                || msg.message?.videoMessage?.contextInfo
                || msg.message?.stickerMessage?.contextInfo
                || msg.message?.documentMessage?.contextInfo;

            const quotedMessage = ctxInfo?.quotedMessage || null;
            const quotedText    = extractText(quotedMessage);
            const stanzaId      = ctxInfo?.stanzaId;
            const quotedPart    = ctxInfo?.participant;
            const imageMsg      = extractImage(msg.message) || extractImage(quotedMessage);

            if (!userText && !quotedText && !imageMsg) {
                return send('⚠️ Usa *.bot <texto>* o responde a un mensaje con *.bot*.');
            }

            const isGroup   = remitente.endsWith('@g.us');
            const senderJid = (isGroup
                ? (msg.key?.participant || msg.participant || remitente)
                : remitente) || remitente;
            const usuario = String(senderJid).split('@')[0].split(':')[0];

            const payload = { usuario, id_externo: msg.key?.id };
            const mensajeFinal = userText || quotedText || '';
            if (mensajeFinal) payload.mensaje = mensajeFinal.substring(0, 2000);
            if (msg.pushName)  payload.nombre = String(msg.pushName).substring(0, 50);

            if (quotedText && userText) {
                const botId    = String(sock.user?.id || '').split(':')[0];
                const authorId = String(quotedPart || '').split(':')[0];
                payload.responde_a = {
                    texto: quotedText.substring(0, 500),
                    de: authorId === botId ? 'personaje' : 'usuario'
                };
            }

            if (imageMsg) {
                const dataUrl = await imageToDataUrl(imageMsg, dlFn);
                if (dataUrl) payload.imagen = dataUrl;
            }

            console.log('[bot] → POST', JSON.stringify({
                usuario, mensaje: payload.mensaje?.substring(0, 60),
                imagen: !!payload.imagen
            }));

            // ─── POST ────────────────────────────────
            let data;
            try {
                const ctrl  = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
                const res = await fetch(CHAT_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    signal: ctrl.signal
                });
                clearTimeout(timer);
                const rawBody = await res.text();
                console.log('[bot] ←', res.status, rawBody.substring(0, 300));
                if (!res.ok) {
                    let m = `HTTP ${res.status}`;
                    try { const j = JSON.parse(rawBody); if (j.error) m = j.error; } catch {}
                    throw new Error(m);
                }
                data = JSON.parse(rawBody);
            } catch (e) {
                console.error('[bot] ❌ fetch:', e.message);
                const local = /127\.0\.0\.1|localhost|192\.168\.|^10\.|172\.(1[6-9]|2\d|3[01])\./.test(BASE);
                const hint = local
                    ? '\n\n💡 IP local → Heroku NO llega. Usa la URL pública del panel.'
                    : '\n\n💡 ¿Panel/túnel abiertos? Prueba *.bot health*.';
                return send(`❌ ${e.message}${hint}`);
            }

            // ─── Avisos ──────────────────────────────
            for (const a of (data.avisos || [])) {
                const t = typeof a === 'string' ? a : a?.texto;
                if (t) await send(t);
                await delay(400);
            }

            // ─── Burbujas ────────────────────────────
            const burbujas = Array.isArray(data.mensajes) && data.mensajes.length
                ? data.mensajes
                : (data.respuestas || []).map(t => ({ texto: t }));

            const lista = burbujas.map(b => ({
                texto:      String(b?.texto ?? b ?? '').trim(),
                responde_a: b?.responde_a || null
            })).filter(b => b.texto);

            if (!lista.length) {
                if (!(data.avisos || []).length) {
                    return send(data.pendiente
                        ? '🤖 Te contestará más tarde.'
                        : '🤖 Sin respuesta.');
                }
                return;
            }

            remember(msg.key?.id, {
                stanzaId: msg.key?.id, participant: senderJid, text: mensajeFinal
            });

            const useQuote = Boolean(quotedMessage && stanzaId);
            if (useQuote) {
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch {}
            }

            for (const b of lista) {
                const text = sanitize(b.texto);
                let ctxToUse = null;
                if (b.responde_a?.id_externo) {
                    const orig = externalMsgs.get(String(b.responde_a.id_externo));
                    if (orig) ctxToUse = {
                        stanzaId: orig.stanzaId,
                        participant: orig.participant,
                        quotedMessage: { conversation: orig.text || '' }
                    };
                }
                if (!ctxToUse && useQuote) {
                    ctxToUse = { stanzaId, participant: quotedPart || senderJid, quotedMessage };
                }
                try {
                    if (ctxToUse)
                        await sock.sendMessage(remitente, { text, contextInfo: ctxToUse });
                    else
                        await sock.sendMessage(remitente, { text }, { quoted: msg });
                    await delay(600);
                } catch (e) {
                    console.error('[bot] burbuja falló:', e.message);
                    try { await sock.sendMessage(remitente, { text }); } catch {}
                }
            }
            console.log('[bot] ✅ fin');

        } catch (e) {
            console.error('[bot] ❌ FATAL:', e);
            try { await sock.sendMessage(remitente,
                { text: `❌ Error: ${e.message}` }, { quoted: msg }); } catch {}
        }
    }
};
