// plugins/val.js — Chat con personaje IA (FMAheart)
// Activación: .bot <texto>  (alias: .val)

console.log('╔════════════════════════════════════════════════╗');
console.log('║ [bot] 🔌 CARGANDO plugins/val.js               ║');
console.log('╚════════════════════════════════════════════════╝');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const RAW = (process.env.FMA_API_URL || process.env.VAL_API_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const CHAT_URL   = RAW.endsWith('/api/v1/chat') ? RAW : `${RAW}/api/v1/chat`;
const BASE       = RAW.replace(/\/api\/v1\/chat$/, '');
const HEALTH_URL = `${BASE}/healthz`;
const API_KEY    = process.env.FMA_API_KEY || process.env.VAL_API_KEY || '';
const TIMEOUT    = 90_000;

// ─── Cache de citas ─────────────────────────────────
const externalMsgs = new Map();
function remember(id, data) {
    if (!id) return;
    externalMsgs.set(String(id), data);
    if (externalMsgs.size > 500) externalMsgs.delete(externalMsgs.keys().next().value);
}

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

export default {
    name: 'bot',
    match: (text) => /^\.(bot|val)(\s+|$)/i.test(String(text || '').trim()),

    execute: async (ctx) => {
        const { sock, remitente, msg, textoLimpio, downloadContentFromMessage: dlFn } = ctx || {};
        if (!sock || !remitente || !msg) return;
        if (!API_KEY) return sock.sendMessage(remitente, { text: '❌ Falta FMA_API_KEY.' }, { quoted: msg });

        const send = async (text, extra) => {
            try { await sock.sendMessage(remitente, { text: sanitize(text), ...(extra || {}) }, { quoted: msg }); }
            catch (e) { console.error('[bot] sendMessage falló:', e.message); }
        };

        try {
            let raw = String(textoLimpio || '').replace(/^\.(bot|val)\s*/i, '').trim();
            if (!raw) return send('⚠️ Usa *.bot <texto>* para hablar.');

            // Transformar "acepto" a "/acepto"
            if (/^acepto$/i.test(raw)) raw = "/acepto";

            const isGroup   = remitente.endsWith('@g.us');
            const senderJid = (isGroup ? (msg.key?.participant || msg.participant || remitente) : remitente) || remitente;
            const usuario   = String(senderJid).split('@')[0].split(':')[0];

            // Poner estado "escribiendo..." mientras la API piensa
            try { await sock.sendPresenceUpdate('composing', remitente); } catch {}

            const ctxInfo = msg.message?.extendedTextMessage?.contextInfo
                || msg.message?.imageMessage?.contextInfo
                || msg.message?.videoMessage?.contextInfo
                || msg.message?.documentMessage?.contextInfo;

            const quotedMessage = ctxInfo?.quotedMessage || null;
            const quotedText    = extractText(quotedMessage);
            const stanzaId      = ctxInfo?.stanzaId;
            const quotedPart    = ctxInfo?.participant;
            const imageMsg      = extractImage(msg.message) || extractImage(quotedMessage);

            const payload = { usuario, id_externo: msg.key?.id };
            if (raw || quotedText) payload.mensaje = (raw || quotedText).substring(0, 2000);
            if (msg.pushName) payload.nombre = String(msg.pushName).substring(0, 50);

            if (quotedText && raw) {
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

            console.log('[bot] → POST:', JSON.stringify({ ...payload, imagen: !!payload.imagen }));

            let data;
            try {
                const ctrl  = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
                const res = await fetch(CHAT_URL, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
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
                try { await sock.sendPresenceUpdate('paused', remitente); } catch {}
                return send(`❌ Error de red: ${e.message}`);
            }

            // Quitar estado "escribiendo..."
            try { await sock.sendPresenceUpdate('paused', remitente); } catch {}

            for (const a of (data.avisos || [])) {
                const t = typeof a === 'string' ? a : a?.texto;
                if (t) await send(t);
                await delay(400);
            }

            const burbujas = Array.isArray(data.mensajes) && data.mensajes.length
                ? data.mensajes : (data.respuestas || []).map(t => ({ texto: t }));

            const lista = burbujas.map(b => ({
                texto: String(b?.texto ?? b ?? '').trim(),
                responde_a: b?.responde_a || null
            })).filter(b => b.texto);

            if (!lista.length) {
                if (!(data.avisos || []).length) {
                    return send(data.pendiente ? '🤖 Te contestará más tarde.' : '🤖 (Irene se ha quedado callada...)');
                }
                return;
            }

            // CORREGIDO AQUÍ: senderJid en vez de senderJig
            remember(msg.key?.id, { stanzaId: msg.key?.id, participant: senderJid, text: payload.mensaje || '' });

            const useQuote = Boolean(quotedMessage && stanzaId);
            if (useQuote) { try { await sock.sendMessage(remitente, { delete: msg.key }); } catch {} }

            for (const b of lista) {
                const text = sanitize(b.texto);
                let ctxToUse = null;
                if (b.responde_a?.id_externo) {
                    const orig = externalMsgs.get(String(b.responde_a.id_externo));
                    if (orig) ctxToUse = { stanzaId: orig.stanzaId, participant: orig.participant, quotedMessage: { conversation: orig.text || '' } };
                }
                if (!ctxToUse && useQuote) {
                    ctxToUse = { stanzaId, participant: quotedPart || senderJid, quotedMessage };
                }
                try {
                    try { await sock.sendPresenceUpdate('composing', remitente); } catch {}
                    await delay(300);
                    
                    if (ctxToUse) await sock.sendMessage(remitente, { text, contextInfo: ctxToUse });
                    else await sock.sendMessage(remitente, { text }, { quoted: msg });
                    
                    await delay(600);
                } catch (e) {
                    console.error('[bot] burbuja falló:', e.message);
                    try { await sock.sendMessage(remitente, { text }); } catch {}
                }
            }

        } catch (e) {
            console.error('[bot] ❌ FATAL:', e);
            try { await sock.sendMessage(remitente, { text: `❌ Error: ${e.message}` }, { quoted: msg }); } catch {}
        }
    }
};
