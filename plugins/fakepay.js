// plugins/fakepay.js
const { proto } = require('@whiskeysockets/baileys');

// Badge thumbnail PNG mínimo (ícono verde de pago)
const GREEN_PAY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEeQHzjM/T7wAAAABJRU5ErkJggg==',
    'base64'
);

module.exports = {
    name: 'fakepay',
    match: (text) => /^\.(fakepay|pay|recibo|pago|transferencia)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(fakepay|pay|recibo|pago|transferencia)\s*/i, '').trim();

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const mentionedJid = contextInfo?.mentionedJid?.[0];
        const quotedParticipant = contextInfo?.participant;

        if (!rawInput && !quotedParticipant && !mentionedJid) {
            const ayuda = "💳 *[FAKEPAY / RECIBO DE PAGO WHATSAPP]* 💳\n\n"
                + "Genera una tarjeta oficial de recibo de pago interactivo de WhatsApp (*OrderMessage*) en el chat.\n\n"
                + "📌 *Uso directo en grupo:*\n"
                + "• `.fakepay <cantidad> | [concepto] | [moneda]`\n"
                + "• Respondiendo a alguien: `.fakepay 250 | Deuda saldada`\n"
                + "• Con mención: `.fakepay @usuario | 500 | Pago de nómina | EUR`\n"
                + "_Ejemplo:_ `.fakepay 150 | Bizum recibido | EUR`\n\n"
                + "🌐 *Uso remoto desde privado:*\n"
                + "1. Usa `.grupos` y luego `.mensajes <número>` para ver el grupo y los PINs.\n"
                + "2. `.fakepay <cantidad> | [concepto] | [moneda]`\n"
                + "• Con objetivo PIN: `.fakepay #PIN | <cantidad> | [concepto]`\n"
                + "• Con grupo explícito: `.fakepay <num_grupo> | <cantidad> | [concepto]`\n\n"
                + "💰 *Monedas soportadas:* EUR, USD, MXN, ARS, COP, CLP, PEN, GBP (por defecto: EUR).";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetGroupJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let targetParticipant = quotedParticipant || mentionedJid || null;
        let targetPushName = '';
        let cantidadNum = 100;
        let concepto = 'Transferencia bancaria procesada con éxito';
        let moneda = 'EUR';

        const monedasValidas = new Set(['EUR', 'USD', 'MXN', 'ARS', 'COP', 'CLP', 'PEN', 'GBP', 'BRL', 'CAD', 'CHF']);

        const asegurarListaGrupos = async () => {
            if (!global.cachedGroupList.length) {
                try {
                    const participating = await sock.groupFetchAllParticipating();
                    const list = Object.values(participating);
                    global.cachedGroupList = list.map((g, index) => ({
                        index: index + 1,
                        id: g.id,
                        subject: g.subject || 'Sin nombre',
                        participantsCount: g.participants?.length || 0,
                        participants: Array.isArray(g.participants) ? g.participants : []
                    }));
                } catch (e) {}
            }
        };

        const resolverParticipante = (selector, groupJid) => {
            if (!selector) return null;
            const cleanSel = selector.replace(/^#/, '').trim().toUpperCase();
            const idx = parseInt(selector, 10) - 1;

            const snap = global.lastDisplayedSnapshot;
            if (snap && (!groupJid || snap.groupJid === groupJid)) {
                if (!isNaN(idx) && idx >= 0 && snap.messages[idx]) return snap.messages[idx];
                const foundSnap = snap.messages.find(m => 
                    (m.shortId && m.shortId.toUpperCase() === cleanSel) ||
                    (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                    (m.pushName && m.pushName.toLowerCase().includes(selector.toLowerCase())) ||
                    (m.participant && m.participant.includes(selector))
                );
                if (foundSnap) return foundSnap;
            }

            if (groupJid) {
                const buf = global.recentGroupMessages.get(groupJid) || [];
                if (!isNaN(idx) && idx >= 0 && buf[idx]) return buf[idx];
                const foundBuf = buf.find(m => 
                    (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                    (m.pushName && m.pushName.toLowerCase().includes(selector.toLowerCase())) ||
                    (m.participant && m.participant.includes(selector))
                );
                if (foundBuf) return foundBuf;
            }

            return null;
        };

        const parts = rawInput.split('|').map(p => p.trim()).filter(Boolean);

        if (!isGroup) {
            // MODO REMOTO (Desde chat privado)
            await asegurarListaGrupos();

            let argOffset = 0;

            // Caso A: Primer parámetro es un número de grupo (ej: .fakepay 1 | 500 | Bizum)
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10)) && global.cachedGroupList.some(g => g.index === parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetGroupJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetGroupJid;
                    argOffset = 1;
                }
            } else if (global.lastViewedGroup) {
                targetGroupJid = global.lastViewedGroup;
                const found = global.cachedGroupList.find(g => g.id === targetGroupJid);
                if (found) groupSubject = found.subject;
            } else if (global.cachedGroupList?.length > 0) {
                targetGroupJid = global.cachedGroupList[0].id;
                groupSubject = global.cachedGroupList[0].subject;
                global.lastViewedGroup = targetGroupJid;
            }

            // Procesar resto de argumentos tras argOffset
            const remainingParts = parts.slice(argOffset);

            // Comprobar si el primer argumento tras el grupo es un selector de persona (#PIN)
            if (remainingParts.length > 0 && remainingParts[0].startsWith('#')) {
                const pinSelector = remainingParts[0];
                const matched = resolverParticipante(pinSelector, targetGroupJid);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                }
                remainingParts.shift();
            }

            // Extraer cantidad
            if (remainingParts.length > 0) {
                const parsedNum = parseFloat(remainingParts[0].replace(/[^0-9.,]/g, '').replace(',', '.'));
                if (!isNaN(parsedNum) && parsedNum > 0) {
                    cantidadNum = parsedNum;
                } else if (remainingParts[0]) {
                    concepto = remainingParts[0];
                }
            }

            // Extraer concepto
            if (remainingParts.length > 1) {
                concepto = remainingParts[1];
            }

            // Extraer moneda
            if (remainingParts.length > 2) {
                const posMoneda = remainingParts[2].toUpperCase().trim();
                if (monedasValidas.has(posMoneda)) moneda = posMoneda;
            }

        } else {
            // MODO DIRECTO EN GRUPO
            let currentParts = [...parts];

            // Comprobar selector de persona (#PIN o mención)
            if (currentParts.length > 0 && currentParts[0].startsWith('#')) {
                const matched = resolverParticipante(currentParts[0], remitente);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                }
                currentParts.shift();
            }

            // Extraer cantidad
            if (currentParts.length > 0) {
                const parsedNum = parseFloat(currentParts[0].replace(/[^0-9.,]/g, '').replace(',', '.'));
                if (!isNaN(parsedNum) && parsedNum > 0) {
                    cantidadNum = parsedNum;
                } else if (currentParts[0]) {
                    concepto = currentParts[0];
                }
            }

            // Extraer concepto
            if (currentParts.length > 1) {
                concepto = currentParts[1];
            }

            // Extraer moneda
            if (currentParts.length > 2) {
                const posMoneda = currentParts[2].toUpperCase().trim();
                if (monedasValidas.has(posMoneda)) moneda = posMoneda;
            }
        }

        if (!targetGroupJid) {
            return sock.sendMessage(remitente, {
                text: "❌ Selecciona primero un grupo con `.grupos` y `.mensajes <número>`."
            }, { quoted: msg });
        }

        // Determinar remitente/vendedor de la transacción (ordenante o WhatsApp oficial)
        let sellerJid = '0@s.whatsapp.net';
        let sellerDisplay = 'WhatsApp Pay';

        if (targetParticipant) {
            sellerJid = targetParticipant.includes('@') ? targetParticipant : `${targetParticipant}@s.whatsapp.net`;
            sellerDisplay = targetPushName ? `${targetPushName} (+${sellerJid.split('@')[0]})` : `+${sellerJid.split('@')[0]}`;
        }

        // Convertir importe a formato milésimas (amount1000)
        const totalAmount1000 = Math.round(cantidadNum * 1000);
        const orderId = 'PAY-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();

        // Formatear mensaje de la orden
        const orderPayload = {
            orderMessage: {
                orderId: orderId,
                thumbnail: GREEN_PAY_PNG,
                itemCount: 1,
                status: proto.Message.OrderMessage.OrderStatus.ACCEPTED, // ACCEPTED = Confirmado / Pagado
                surface: proto.Message.OrderMessage.OrderSurface.CATALOG,
                message: `📄 Concepto: ${concepto}`,
                orderTitle: 'WhatsApp Pay • Transferencia Confirmada',
                sellerJid: sellerJid,
                totalAmount1000: totalAmount1000,
                totalCurrencyCode: moneda,
                contextInfo: {
                    mentionedJid: targetParticipant ? [sellerJid] : []
                }
            }
        };

        try {
            if (isGroup && msg?.key) {
                // En grupo: borrar comando del operador para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Inyectar el recibo oficial en el grupo
            await sock.relayMessage(targetGroupJid, orderPayload, {});

            // Confirmar al operador si se lanzó desde chat privado
            if (!isGroup) {
                const importeFormateado = cantidadNum.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const reporte = `💳 *[RECIBO DE PAGO EMITIDO CON ÉXITO]*\n\n`
                    + `👥 *Grupo:* ${groupSubject}\n`
                    + `💰 *Importe:* ${importeFormateado} ${moneda}\n`
                    + `📄 *Concepto:* "${concepto}"\n`
                    + `👤 *Titular / Ordenante:* ${sellerDisplay}\n`
                    + `🆔 *ID Transacción:* \`${orderId}\`\n`
                    + `✅ *Estado:* Confirmado (ACCEPTED)`;

                await sock.sendMessage(remitente, { text: reporte }, { quoted: msg });
            }

        } catch (err) {
            console.error('[fakepay] Error emitiendo recibo:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al emitir recibo de pago: ${err.message}`
            }, { quoted: msg });
        }
    }
};
