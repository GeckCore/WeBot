// plugins/ghosttag.js

module.exports = {
    name: 'ghosttag',
    match: (text) => /^\.(ghosttag|gtag|fantasma|ghost)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio, quoted }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(ghosttag|gtag|fantasma|ghost)\s*/i, '').trim();

        if (!rawInput && !quoted) {
            const ayuda = "❌ *Formato incorrecto.*\n\n"
                + "📌 *Uso directo en grupo:*\n"
                + "• `.ghosttag @usuario <mensaje>` (Mención fantasma solo a esa persona)\n"
                + "• `.ghosttag <mensaje>` (Ghost Tagall silencioso a todos los miembros)\n\n"
                + "🌐 *Uso remoto desde chat privado:*\n"
                + "1. Usa `.grupos` y luego `.mensajes <número>` para ver el grupo y sus personas con PIN (#XXXX).\n"
                + "2. `.ghosttag <#PIN o número> | <mensaje>` (Mención fantasma individual)\n"
                + "3. `.ghosttag <mensaje>` (Ghost Tagall a todo el grupo seleccionado)\n"
                + "• O directo: `.ghosttag <num_grupo> | <#PIN o número> | <mensaje>`";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetGroupJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let textoFinal = '';
        let targetParticipant = null;
        let targetPushName = '';
        let isTagAll = false;

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

        // Función para resolver un participante a partir de PIN (#18B4), número (1), pushName o JID
        const resolverParticipante = (selector, groupJid) => {
            if (!selector) return null;
            const cleanSel = selector.replace(/^#/, '').trim().toUpperCase();
            const idx = parseInt(selector, 10) - 1;

            // 1. Buscar en el snapshot congelado de .mensajes
            const snap = global.lastDisplayedSnapshot;
            if (snap && (!groupJid || snap.groupJid === groupJid)) {
                // Por índice [1..N]
                if (!isNaN(idx) && idx >= 0 && snap.messages[idx]) {
                    return snap.messages[idx];
                }
                // Por PIN (#XXXX) o ID corto
                const foundSnap = snap.messages.find(m => 
                    (m.shortId && m.shortId.toUpperCase() === cleanSel) ||
                    (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                    (m.pushName && m.pushName.toLowerCase().includes(selector.toLowerCase())) ||
                    (m.participant && m.participant.includes(selector))
                );
                if (foundSnap) return foundSnap;
            }

            // 2. Fallback: Buscar en el buffer de memoria en tiempo real
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
        // MODO 1: EJECUCIÓN DIRECTA EN GRUPO
        // ==========================================
        if (isGroup) {
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            const mentionedJids = contextInfo?.mentionedJid || [];
            const quotedParticipant = contextInfo?.participant;

            // Si tiene barra vertical en el grupo: .ghosttag #PIN | mensaje o .ghosttag 1 | mensaje
            const separatorIndex = rawInput.indexOf('|');
            if (separatorIndex !== -1) {
                const sel = rawInput.slice(0, separatorIndex).trim();
                const matched = resolverParticipante(sel, remitente);
                if (matched) {
                    targetParticipant = matched.participant;
                    targetPushName = matched.pushName || '';
                    textoFinal = rawInput.slice(separatorIndex + 1).trim();
                } else if (sel.toLowerCase() === 'all' || sel.toLowerCase() === 'todos') {
                    isTagAll = true;
                    textoFinal = rawInput.slice(separatorIndex + 1).trim();
                }
            }

            if (!textoFinal && mentionedJids.length > 0) {
                // Etiqueta a la persona mencionada
                targetParticipant = mentionedJids[0];
                textoFinal = rawInput.replace(/@\d+/g, '').trim();
            } else if (!textoFinal && quotedParticipant) {
                // Etiqueta al autor del mensaje citado
                targetParticipant = quotedParticipant;
                textoFinal = rawInput.trim();
            } else if (!textoFinal) {
                // Si no hay mención explícita ni cita ni selector, es GHOST TAGALL
                isTagAll = true;
                textoFinal = rawInput.trim();
            }
        } 
        // ==========================================
        // MODO 2: EJECUCIÓN REMOTA DESDE PRIVADO
        // ==========================================
        else {
            await asegurarListaGrupos();
            const parts = rawInput.split('|').map(p => p.trim());

            // Caso A: Formato explícito de 3 partes: .ghosttag <num_grupo> | <#PIN o num o all> | <mensaje>
            if (parts.length >= 3 && !isNaN(parseInt(parts[0], 10))) {
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
                textoFinal = parts.slice(2).join('|').trim();

                if (personaSelector.toLowerCase() === 'all' || personaSelector.toLowerCase() === 'todos') {
                    isTagAll = true;
                } else {
                    const matched = resolverParticipante(personaSelector, targetGroupJid);
                    if (matched) {
                        targetParticipant = matched.participant;
                        targetPushName = matched.pushName || '';
                    } else {
                        // Si no encuentra a la persona específica, notifica al operador
                        return sock.sendMessage(remitente, {
                            text: `❌ Participante [${personaSelector}] no encontrado en el grupo.\n📌 Usa primero \`.mensajes ${groupIdx}\` para ver los PINs y números activos.`
                        }, { quoted: msg });
                    }
                }
            }
            // Caso B: Con grupo ya seleccionado vía .mensajes <número> o .grupos
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
                        text: "❌ No hay ningún grupo seleccionado.\n📌 *Uso:* Primero usa `.grupos` y `.mensajes <número>`."
                    }, { quoted: msg });
                }

                // Subcaso B1: Tiene barra | (.ghosttag <#PIN o num> | <mensaje>)
                if (parts.length >= 2) {
                    const personaSelector = parts[0];
                    if (personaSelector.toLowerCase() === 'all' || personaSelector.toLowerCase() === 'todos') {
                        isTagAll = true;
                        textoFinal = parts.slice(1).join('|').trim();
                    } else {
                        const matched = resolverParticipante(personaSelector, targetGroupJid);
                        if (matched) {
                            targetParticipant = matched.participant;
                            targetPushName = matched.pushName || '';
                            textoFinal = parts.slice(1).join('|').trim();
                        } else {
                            // Si el primer segmento no es un selector de persona válido, es Tagall con mensaje
                            isTagAll = true;
                            textoFinal = rawInput.trim();
                        }
                    }
                } 
                // Subcaso B2: Sin barra | (.ghosttag <mensaje>) -> Tagall por defecto al grupo seleccionado
                else {
                    isTagAll = true;
                    textoFinal = rawInput.trim();
                }
            }
        }

        if (!textoFinal) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Escribe el mensaje que deseas enviar con mención fantasma."
            }, { quoted: msg });
        }

        try {
            // Resolver lista de menciones
            let finalMentions = [];

            if (isTagAll || !targetParticipant) {
                // Ghost Tagall: obtener todos los participantes con fallbacks robustos
                let rawList = [];
                try {
                    const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
                    if (metadata) {
                        groupSubject = metadata.subject || groupSubject;
                        if (Array.isArray(metadata.participants)) rawList = metadata.participants;
                    }
                } catch (e) {}

                if (!rawList.length && global.cachedGroupList?.length) {
                    const foundCached = global.cachedGroupList.find(g => g.id === targetGroupJid);
                    if (foundCached) {
                        if (foundCached.subject) groupSubject = foundCached.subject;
                        if (Array.isArray(foundCached.participants)) rawList = foundCached.participants;
                    }
                }

                if (!rawList.length) {
                    try {
                        const allP = await sock.groupFetchAllParticipating();
                        if (allP?.[targetGroupJid]) {
                            const g = allP[targetGroupJid];
                            if (g.subject) groupSubject = g.subject;
                            if (Array.isArray(g.participants)) rawList = g.participants;
                        }
                    } catch (e) {}
                }

                const mSet = new Set();
                for (const p of rawList) {
                    if (p.id) mSet.add(p.id);
                    if (p.phoneNumber) {
                        const pn = p.phoneNumber.includes('@') ? p.phoneNumber : `${p.phoneNumber}@s.whatsapp.net`;
                        mSet.add(pn);
                    }
                }
                finalMentions = Array.from(mSet);
                isTagAll = true;
            } else {
                // Ghost tag individual
                let cleanJid = targetParticipant;
                // Si es un LID, intentar resolver a número de teléfono si está en la metadata
                if (cleanJid.endsWith('@lid')) {
                    try {
                        const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
                        const match = metadata?.participants?.find(p => p.lid === cleanJid || p.id === cleanJid);
                        if (match?.phoneNumber) cleanJid = match.phoneNumber;
                        else if (match?.id?.endsWith('@s.whatsapp.net')) cleanJid = match.id;
                    } catch (e) {}
                }
                finalMentions = [cleanJid];
            }

            if (isGroup) {
                // En grupo: borrar comando para sigilo absoluto
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
            }

            // Enviar mensaje con el array interno de mentions pero SIN ninguna arroba visible en el texto
            await sock.sendMessage(targetGroupJid, {
                text: textoFinal,
                mentions: finalMentions,
                mentionAll: isTagAll
            });

            // Si se envió desde privado, confirmar al operador
            if (!isGroup) {
                const modoTxt = isTagAll 
                    ? `📢 *Ghost Tagall* (${finalMentions.length} miembros notificados)`
                    : `🎯 *Ghost Tag Individual* (+${targetParticipant.split('@')[0]}${targetPushName ? ' - ' + targetPushName : ''})`;

                await sock.sendMessage(remitente, {
                    text: `👻 *[GHOST TAG EJECUTADO]*\n\n`
                        + `👥 *Grupo:* ${groupSubject}\n`
                        + `⚡ *Modo:* ${modoTxt}\n`
                        + `💬 *Mensaje:* "${textoFinal}"`
                }, { quoted: msg });
            }

        } catch (err) {
            console.error('[ghosttag] Error ejecutando ghost tag:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al ejecutar ghost tag: ${err.message}`
            }, { quoted: msg });
        }
    }
};
