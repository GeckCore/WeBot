// plugins/val.js
// .val <texto> — Chat con la IA "Val" vía API local
// Endpoint: POST /api/v1/chat  { usuario, mensaje, responde_a }
// Primera vez devuelve aviso de consentimiento → se acepta con ".val /acepto"

const API_URL = process.env.VAL_API_URL || 'http://127.0.0.1:8765/api/v1/chat';
const API_KEY = process.env.VAL_API_KEY || 'fma_FBaj1OP1W4N5OOQOFKT71Qzldo844YeklR1QV3rp';

// Extrae texto de cualquier tipo de mensaje (conversation, extendedText, captions…)
function extractText(m) {
    if (!m) return '';
    const inner = m.viewOnceMessageV2?.message
        || m.viewOnceMessage?.message
        || m.viewOnceMessageV2Extension?.message
        || m;
    const t = inner.conversation
        || inner.extendedTextMessage?.text
        || inner.imageMessage?.caption
        || inner.videoMessage?.caption
        || inner.stickerMessage?.caption
        || '';
    return String(t || '').trim();
}

export default {
    name: 'val',
    match: (text) => /^\.val(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        const isGroup = remitente.endsWith('@g.us');

        // Texto introducido por el usuario (sin el ".val")
        const userText = (textoLimpio || '').replace(/^\.val\s*/i, '').trim();

        // Contexto del mensaje citado (para fakequote)
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || msg.message?.documentMessage?.contextInfo
            || msg.message?.stickerMessage?.contextInfo;

        const quotedMessage = contextInfo?.quotedMessage || null;
        const quotedText    = extractText(quotedMessage);
        const stanzaId      = contextInfo?.stanzaId;

        if (!userText && !quotedText) {
            return sock.sendMessage(remitente, {
                text: '⚠️ Usa *.val <texto>* para hablar con Val, o responde a un mensaje con *.val*.'
            }, { quoted: msg });
        }

        // Identidad para la memoria persistente del usuario
        // (en grupos usamos el participante, en privado el JID directo)
        const userJid = (isGroup
            ? (msg.key?.participant || msg.participant || remitente)
            : remitente) || remitente;
        const usuario = String(userJid).split('@')[0].split(':')[0];

        // ── Payload base ──────────────────────────────────────
        const payload = {
            usuario,
            mensaje: userText || quotedText
        };

        // ── Fakequote: le decimos a la API a qué mensaje responde ──
        // (usa forma {texto, de} porque el stanzaId de WhatsApp no coincide
        //  con el id interno de la API)
        if (quotedText) {
            const botId   = String(sock.user?.id || '').split(':')[0];
            const authorId = String(contextInfo?.participant || '').split(':')[0];
            payload.responde_a = {
                texto: quotedText,
                de: authorId === botId ? 'personaje' : 'usuario'
            };
        }

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
            }

            const data = await res.json();

            // ── Consentimiento pendiente (primera vez) ─────────
            if (data.pendiente) {
                const aviso = (data.avisos || []).filter(Boolean).join('\n\n')
                    || '📋 Necesito tu consentimiento. Envía *.val /acepto* para continuar.';
                return sock.sendMessage(remitente, { text: aviso }, { quoted: msg });
            }

            // ── Respuestas ─────────────────────────────────────
            const respuestas = (Array.isArray(data.respuestas) ? data.respuestas : [])
                .filter(r => r && String(r).trim());

            if (!respuestas.length) {
                return sock.sendMessage(remitente, {
                    text: '🤖 Val no devolvió respuesta.'
                }, { quoted: msg });
            }

            // Modo fakequote: borrar el comando y responder citando el original
            const useFakeQuote = Boolean(quotedMessage && stanzaId);
            if (useFakeQuote) {
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (_) {}
            }

            for (const respuesta of respuestas) {
                const texto = String(respuesta);
                if (useFakeQuote) {
                    await sock.sendMessage(remitente, {
                        text: texto,
                        contextInfo: {
                            stanzaId,
                            participant: contextInfo.participant || userJid,
                            quotedMessage
                        }
                    });
                } else {
                    await sock.sendMessage(remitente, {
                        text: texto
                    }, { quoted: msg });
                }
            }

        } catch (e) {
            console.error('[val]', e);
            await sock.sendMessage(remitente, {
                text: `❌ Error al contactar a Val: ${e.message}`
            }, { quoted: msg });
        }
    }
};
