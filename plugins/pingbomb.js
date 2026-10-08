// plugins/pingbomb.js
const delay = (ms) => new Promise(res => setTimeout(res, ms));

module.exports = {
    name: 'pingbomb',
    match: (text) => /^\.(pingbomb|pbomb|pb|bomb|pingb)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(pingbomb|pbomb|pb|bomb|pingb)\s*/i, '').trim();

        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const mentionedJid = contextInfo?.mentionedJid?.[0];
        const quotedParticipant = contextInfo?.participant;

        if (!rawInput && !quotedParticipant && !mentionedJid) {
            const ayuda = "💣 *[PINGBOMB TÁCTICO INDIVIDUAL]* 💣\n\n"
                + "Bombardea con menciones fantasma a *UN SOLO USUARIO* sin que aparezca ninguna arroba visible en el chat.\n\n"
                + "📌 *Uso directo en grupo:*\n"
                + "• Respondiendo a la víctima: `.pingbomb [mensaje opcional]`\n"
                + "• Por mención: `.pingbomb @usuario | [mensaje] | [ráfagas (1-5)]`\n"
                + "• Por PIN: `.pingbomb #PIN | [mensaje] | [ráfagas]`\n\n"
                + "🌐 *Uso remoto desde privado:*\n"
                + "1. Usa `.grupos` y luego `.mensajes <número>` para ver el grupo y los PINs (#XXXX).\n"
                + "2. `.pingbomb <#PIN o número> | [mensaje] | [ráfagas (1-5)]`\n"
                + "• O explícito: `.pingbomb <num_grupo> | <#PIN o num> | [mensaje] | [ráfagas]`\n\n"
                + "⚡ *Seguridad:* El bot envía entre 1 y 5 pings discretos con delay seguro para no alertar filtros de spam.";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetGroupJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let targetParticipant = quotedParticipant || mentionedJid || null;
        let targetPushName = '';
        let textoMensaje = '.'; // Mensaje discreto por defecto
        let repeticiones = 3; // Ráfaga por defecto

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

            // 1. Snapshot congelado de .mensajes
            const snap = global.lastDisplayedSnapshot;
            if (snap && (!groupJid || snap.groupJid === groupJid)) {
                if (!isNaN(idx) && idx >= 0 && snap.messages[idx]) {
                    return snap.messages[idx];
                }
                const foundSnap = snap.messages.find(m => 
                    (m.shortId && m.shortId.toUpperCase() === cleanSel) ||
                    (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                    (m.pushName && m.pushName.toLowerCase().includes(selector.toLowerCase())) ||
                    (m.participant && m.participant.includes(selector))
                );
                if (foundSnap) return foundSnap;
            }

            // 2. Buffer en tiempo real
            if (groupJid) {
                const buf = global.recentGroupMessages.get(groupJid) || [];
                if (!isNaN(idx) && idx >= 0 && buf[idx]) {
                    return buf[idx];
                }
                const foundBuf = buf.find(m => 
                    (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                    (m.pushName && m.pushName.toLowerCase().includes(selector.toLowerCase())) ||
                    (m.participant && m.participant.includes(selector))
                );
                if (foundBuf) return foundBuf;
            }

            return null;
        };

        // ==========================================
        // PARSEAR ARGUMENTOS Y OBJETIVO
        // ==========================================
        const parts = rawInput.split('|').map(p => p.trim());

        if (isGroup) {
            // MODO EN GRUPO DIRECTO
            if (quotedParticipant) {
                targetParticipant = quotedParticipant;
                if (parts[0]) textoMensaje = parts[0];
                if (parts[1] && !isNaN(parseInt(parts[1], 10))) {
                    repeticiones = Math.min(5, Math.max(1, parseInt(parts[1], 10)));
                }
            } else if (mentionedJid) {
                targetParticipant = mentionedJid;
                const cleanTxt = rawInput.replace(/@\d+/g, '').trim();
                const subParts = cleanTxt.split('|').map(p => p.trim()).filter(Boolean);
                if (subParts[0]) textoMensaje = subParts[0];
                if (subParts[1] && !isNaN(parseInt(subParts[1], 10))) {
                    repeticiones = Math.min(5, Math.max(1, parseInt(subParts[1], 10)));
                }
            } else if (parts.length >= 1) {
                const sel = parts[0];
                const matched = resolverParticipante(sel, remitente);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                    if (parts[1]) textoMensaje = parts[1];
                    if (parts[2] && !isNaN(parseInt(parts[2], 10))) {
                        repeticiones = Math.min(5, Math.max(1, parseInt(parts[2], 10)));
                    }
                }
            }
        } else {
            // MODO REMOTO DESDE PRIVADO
            await asegurarListaGrupos();

            // Caso A: 3 o 4 partes con grupo explícito: .pingbomb <num_grupo> | <#PIN o num> | [mensaje] | [ráfagas]
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                const groupIdx = parseInt(parts[0], 10);
                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetGroupJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetGroupJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }

                const personaSelector = parts[1];
                const matched = resolverParticipante(personaSelector, targetGroupJid);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Participante [${personaSelector}] no encontrado en el grupo [${groupIdx}].\n📌 Usa \`.mensajes ${groupIdx}\` para ver los PINs activos.`
                    }, { quoted: msg });
                }

                if (parts[2]) textoMensaje = parts[2];
                if (parts[3] && !isNaN(parseInt(parts[3], 10))) {
                    repeticiones = Math.min(5, Math.max(1, parseInt(parts[3], 10)));
                }
            }
            // Caso B: Con grupo ya seleccionado vía .grupos o .mensajes
            else {
                if (global.lastViewedGroup) {
                    targetGroupJid = global.lastViewedGroup;
                    const found = global.cachedGroupList.find(g => g.id === targetGroupJid);
                    if (found) groupSubject = found.subject;
                } else if (global.cachedGroupList?.length > 0) {
                    targetGroupJid = global.cachedGroupList[0].id;
                    groupSubject = global.cachedGroupList[0].subject;
                    global.lastViewedGroup = targetGroupJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: "❌ No hay ningún grupo seleccionado.\n📌 Usa primero `.grupos` y `.mensajes <número>`."
                    }, { quoted: msg });
                }

                const personaSelector = parts[0];
                const matched = resolverParticipante(personaSelector, targetGroupJid);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Participante [${personaSelector}] no encontrado.\n📌 Usa \`.mensajes\` para ver los PINs activos.`
                    }, { quoted: msg });
                }

                if (parts[1]) textoMensaje = parts[1];
                if (parts[2] && !isNaN(parseInt(parts[2], 10))) {
                    repeticiones = Math.min(5, Math.max(1, parseInt(parts[2], 10)));
                }
            }
        }

        if (!targetGroupJid) {
            return sock.sendMessage(remitente, {
                text: "❌ Selecciona un grupo con `.grupos` y `.mensajes <número>`."
            }, { quoted: msg });
        }

        if (!targetParticipant) {
            return sock.sendMessage(remitente, {
                text: "❌ Debes especificar un usuario objetivo (mención @usuario, citando su mensaje o con `#PIN`)."
            }, { quoted: msg });
        }

        // ==========================================
        // RESOLVER JIDs DE LA VÍCTIMA (PN + LID)
        // ==========================================
        let targetPnJid = '';
        let targetLidJid = '';

        try {
            const meta = await sock.groupMetadata(targetGroupJid).catch(() => null);
            if (meta) {
                if (meta.subject) groupSubject = meta.subject;
                const match = meta.participants?.find(p => 
                    p.id === targetParticipant || 
                    p.lid === targetParticipant || 
                    p.phoneNumber === targetParticipant
                );
                if (match) {
                    targetPnJid = match.phoneNumber || (match.id?.endsWith('@s.whatsapp.net') ? match.id : '');
                    targetLidJid = match.lid || (match.id?.endsWith('@lid') ? match.id : '');
                }
            }
        } catch (e) {}

        if (!targetPnJid && targetParticipant.endsWith('@s.whatsapp.net')) targetPnJid = targetParticipant;
        if (!targetLidJid && targetParticipant.endsWith('@lid')) targetLidJid = targetParticipant;
        if (!targetPnJid && !targetLidJid) targetPnJid = targetParticipant;

        // Construir array masivo de 50 menciones dirigidas exclusivamente a esa persona
        const singleMentions = [];
        if (targetPnJid) {
            const cleanPn = targetPnJid.includes('@') ? targetPnJid : `${targetPnJid}@s.whatsapp.net`;
            for (let i = 0; i < 25; i++) singleMentions.push(cleanPn);
        }
        if (targetLidJid) {
            for (let i = 0; i < 25; i++) singleMentions.push(targetLidJid);
        }
        if (!singleMentions.length) {
            singleMentions.push(targetParticipant);
        }

        // Si se ejecutó directamente en el grupo, borrar el comando del operador
        if (isGroup && msg?.key) {
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
        }

        try {
            // Ejecutar la ráfaga de pings con intervalo seguro
            for (let i = 0; i < repeticiones; i++) {
                await sock.sendMessage(targetGroupJid, {
                    text: textoMensaje,
                    mentions: singleMentions
                });

                if (i < repeticiones - 1) {
                    await delay(800); // 800ms de delay seguro para no saltar rate-limits
                }
            }

            // Confirmar al operador si se ejecutó desde chat privado
            if (!isGroup) {
                const targetDisplay = targetPnJid ? targetPnJid.split('@')[0] : targetParticipant.split('@')[0];
                const pushDisplay = targetPushName ? ` (${targetPushName})` : '';

                const reporte = `💣 *[PINGBOMB EJECUTADO CON ÉXITO]*\n\n`
                    + `🎯 *Objetivo:* +${targetDisplay}${pushDisplay}\n`
                    + `👥 *Grupo:* ${groupSubject}\n`
                    + `⚡ *Ráfagas enviadas:* ${repeticiones} impactos\n`
                    + `💬 *Mensaje emitido:* "${textoMensaje}"\n`
                    + `👻 *Sigilo:* Mención 100% fantasma (sin @ visible en el chat).`;

                await sock.sendMessage(remitente, { text: reporte }, { quoted: msg });
            }

        } catch (err) {
            console.error('[pingbomb] Error:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al ejecutar pingbomb: ${err.message}`
            }, { quoted: msg });
        }
    }
};
