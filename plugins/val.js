// plugins/val.js — Chat con el personaje vía API FMAheart
// Env: FMA_API_URL (o VAL_API_URL) + FMA_API_KEY (o VAL_API_KEY)
// Acepta tanto base (https://x.com) como endpoint completo (https://x.com/api/v1/chat)

import { downloadContentFromMessage, delay } from '@whiskeysockets/baileys';

// ─── Configuración ───────────────────────────────────────
const RAW = (process.env.FMA_API_URL
    || process.env.VAL_API_URL
    || 'http://127.0.0.1:8765').replace(/\/+$/, '');

const CHAT_URL   = RAW.endsWith('/api/v1/chat') ? RAW : `${RAW}/api/v1/chat`;
const BASE       = RAW.replace(/\/api\/v1\/chat$/, '');
const HEALTH_URL = `${BASE}/healthz`;

const API_KEY = process.env.FMA_API_KEY || process.env.VAL_API_KEY || '';
const TIMEOUT = 90_000;

let healthChecked = false;

// ─── Cache de citas: id_externo → { stanzaId, participant, text } ──
const externalMsgs = new Map();
const MAX_CACHE = 500;
function remember(id, data) {
    if (!id) return;
    externalMsgs.set(String(id), data);
    if (externalMsgs.size > MAX_CACHE) {
        externalMsgs.delete(externalMsgs.keys().next().value);
    }
}

// ─── Helpers ─────────────────────────────────────────────
function unwrap(m) {
    if (!m) return null;
    return m.viewOnceMessageV2?.message
        || m.viewOnceMessage?.message
        || m.viewOnceMessageV2Extension?.message
        || m;
}
function extractText(m) {
    const i = unwrap(m);
    if (!i) return '';
    return String(
        i.conversation
        || i.extendedTextMessage?.text
        || i.imageMessage?.caption
        || i.videoMessage?.caption
        || ''
    ).trim();
}
function extractImage(m) {
    const i = unwrap(m);
    return i?.imageMessage || null;
}
// Neutraliza URLs: sin link-preview-js instalado, Baileys revienta al previsualizarlas
function sanitize(t) {
    return String(t || '').replace(/https?:\/\/\S+/gi, '[enlace]');
}

async function imageToDataUrl(imageMsg) {
    if (!imageMsg) return null;
    try {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const mime = imageMsg.mimetype || 'image/jpeg';
        return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
    } catch (e) {
        console.error('[val] imagen:', e.message);
        return null;
    }
}

async function checkHealthOnce() {
    if (healthChecked) return;
    healthChecked = true;
    try {
        const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
        const j = await r.json().catch(() => ({}));
        console.log('[val] healthz:', r.status, JSON.stringify(j).substring(0, 120));
    } catch (e) {
        console.warn('[val] healthz FALLÓ:', e.message);
        console.warn('[val] → ¿Panel/túnel abiertos? ¿FMA_API_URL es la dirección PÚBLICA?');
    }
}

// ─── Plugin ──────────────────────────────────────────────
export default {
    name: 'val',
    match: (text) => /^\.val(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        if (!API_KEY) {
            return sock.sendMessage(remitente, {
                text: '❌ Falta FMA_API_KEY en variables de entorno.'
            }, { quoted: msg });
        }

        await checkHealthOnce();

        const isGroup  = remitente.endsWith('@g.us');
        const userText = (textoLimpio || '').replace(/^\.val\s*/i, '').trim();

        const ctx =
            msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || msg.message?.stickerMessage?.contextInfo
            || msg.message?.documentMessage?.contextInfo;

        const quotedMessage = ctx?.quotedMessage || null;
        const quotedText    = extractText(quotedMessage);
        const stanzaId      = ctx?.stanzaId;
        const quotedPart    = ctx?.participant;

        const currentImage = extractImage(msg.message);
        const quotedImage  = extractImage(quotedMessage);
        const imageMsg     = currentImage || quotedImage;

        if (!userText && !quotedText && !imageMsg) {
            return sock.sendMessage(remitente, {
                text: '⚠️ Usa *.val <texto>* o responde a un mensaje/foto con *.val*.'
            }, { quoted: msg });
        }

        // ── Identidad ESTABLE (nunca cambia para el mismo usuario) ──
        const senderJid = (isGroup
            ? (msg.key?.participant || msg.participant || remitente)
            : remitente) || remitente;
        const usuario = String(senderJid).split('@')[0].split(':')[0];

        // ── Payload ──────────────────────────────────────────
        const payload = {
            usuario,
            id_externo: msg.key?.id
        };
        const mensajeFinal = userText || quotedText || '';
        if (mensajeFinal) payload.mensaje = mensajeFinal.substring(0, 2000);
        if (msg.pushName)  payload.nombre = String(msg.pushName).substring(0, 50);

        // El usuario responde a un mensaje CON un texto nuevo
        if (quotedText && userText) {
            const botId    = String(sock.user?.id || '').split(':')[0];
            const authorId = String(quotedPart || '').split(':')[0];
            payload.responde_a = {
                texto: quotedText.substring(0, 500),
                de: authorId === botId ? 'personaje' : 'usuario'
            };
        }

        if (imageMsg) {
            const dataUrl = await imageToDataUrl(imageMsg);
            if (dataUrl) payload.imagen = dataUrl;
        }

        console.log('[val] →', JSON.stringify({
            usuario: payload.usuario,
            id_externo: payload.id_externo,
            mensaje: payload.mensaje?.substring(0, 60),
            responde_a: payload.responde_a,
            imagen: payload.imagen ? `<${payload.imagen.length}b>` : undefined
        }));

        // ── POST /api/v1/chat ────────────────────────────────
        let data;
        try {
            const ctrl = new AbortController();
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

            const raw = await res.text();
            console.log('[val] ←', res.status, raw.substring(0, 300));

            if (!res.ok) {
                let m = `HTTP ${res.status}`;
                try { const j = JSON.parse(raw); if (j.error) m = j.error; } catch {}
                throw new Error(m);
            }
            try { data = JSON.parse(raw); }
            catch { throw new Error('Respuesta no-JSON: ' + raw.substring(0, 150)); }
        } catch (e) {
            console.error('[val] fetch:', e.message);
            const local = /127\.0\.0\.1|localhost|192\.168\.|^10\.|172\.(1[6-9]|2\d|3[01])\./.test(BASE);
            const hint = local
                ? '\n\n💡 IP local: desde Heroku NO es alcanzable. Panel → Conexiones → dirección pública → ponla en FMA_API_URL.'
                : '\n\n💡 ¿Panel abierto y cloudflared activo? ¿La URL pública cambió?';
            return sock.sendMessage(remitente, {
                text: `❌ No pude contactar al personaje: ${e.message}${hint}`
            }, { quoted: msg });
        }

        // ── Avisos (consentimiento / sistema / panel) ───────
        const avisos = Array.isArray(data.avisos) ? data.avisos : [];
        for (const a of avisos) {
            const t = (typeof a === 'string') ? a : a?.texto;
            if (!t) continue;
            try { await sock.sendMessage(remitente, { text: sanitize(t) }); }
            catch (e) { console.error('[val] aviso:', e.message); }
            await delay(400);
        }

        // ── Burbujas ────────────────────────────────────────
        const burbujas = Array.isArray(data.mensajes) && data.mensajes.length
            ? data.mensajes
            : (Array.isArray(data.respuestas)
                ? data.respuestas.map(t => ({ texto: t }))
                : []);

        const lista = burbujas
            .map(b => ({
                texto:      String(b?.texto ?? b ?? '').trim(),
                responde_a: b?.responde_a || null,
                apiId:      b?.id || null
            }))
            .filter(b => b.texto);

        if (!lista.length) {
            if (!avisos.length) {
                const extra = data.pendiente
                    ? '🤖 Te contestará más tarde (ritmo "Realista").'
                    : '🤖 Sin respuesta del personaje.';
                return sock.sendMessage(remitente, { text: extra }, { quoted: msg });
            }
            return;
        }

        // Guardar mensaje del usuario para citas futuras del personaje
        remember(msg.key?.id, {
            stanzaId: msg.key?.id,
            participant: senderJid,
            text: mensajeFinal
        });

        const useQuote = Boolean(quotedMessage && stanzaId);
        if (useQuote) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch {}
        }

        for (const b of lista) {
            const text = sanitize(b.texto);

            // 1) El personaje cita → recuperamos el original vía cache
            let ctxToUse = null;
            const cite = b.responde_a;
            if (cite?.id_externo) {
                const orig = externalMsgs.get(String(cite.id_externo));
                if (orig) {
                    ctxToUse = {
                        stanzaId: orig.stanzaId,
                        participant: orig.participant,
                        quotedMessage: { conversation: orig.text || '' }
                    };
                }
            }
            // 2) El usuario citaba → fakequote al citado
            if (!ctxToUse && useQuote) {
                ctxToUse = {
                    stanzaId,
                    participant: quotedPart || senderJid,
                    quotedMessage
                };
            }

            try {
                if (ctxToUse) {
                    await sock.sendMessage(remitente, { text, contextInfo: ctxToUse });
                } else {
                    await sock.sendMessage(remitente, { text }, { quoted: msg });
                }
                await delay(600);
            } catch (e) {
                console.error('[val] burbuja:', e.message);
                try { await sock.sendMessage(remitente, { text }); } catch {}
            }
        }
    }
};
