export default {
    name: 'fakequote_v3',
    match: (text) => /^\.(fake3|fq3|fakequote3)(\s+.*)?$/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted, msgType }) => {
        global.cachedGroupList = global.cachedGroupList || [];
        global.recentGroupMessages = global.recentGroupMessages || new Map();

        const match = textoLimpio.match(/^\.(fake3|fq3|fakequote3)(?:\s+(.*))?$/i);
        const args = (match?.[2] || '').trim();

        if (!args && !quoted) {
            const ayuda = `🎭 *MODO FAKEQUOTE 3.0 (INTERCEPCIÓN INTELIGENTE)*\n\n`
                + `Inyecta citas falsas atribuidas a cualquier usuario usando los mensajes interceptados en memoria.\n\n`
                + `📌 *Uso Remoto (desde chat privado):*\n`
                + `1. Usa \`.grupos\` para ver grupos vinculados.\n`
                + `2. Usa \`.mensajes 1\` para interceptar mensajes recientes.\n`
                + `3. Ejecuta:\n`
                + `   \`.fake3 <número> | <texto_falso> | [respuesta] | [emoji_reacción]\`\n`
                + `   _Ejemplo:_ \`.fake3 1 | Mañana invito yo las pizzas | ¿En serio? Gracias bro 🍕 | 😋\`\n\n`
                + `📌 *Uso Directo en Grupo:*\n`
                + `- Responde a cualquier mensaje de la víctima citándolo con:\n`
                + `   \`.fake3 <texto_falso> | [respuesta] | [emoji]\`\n`
                + `   _(El bot eliminará tu comando y publicará la cita falsa)_\n\n`
                + `📌 *Uso con Mención:* \`.fake3 @usuario texto falso | respuesta\``;

            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        let targetGroupJid = remitente.endsWith('@g.us') ? remitente : global.lastViewedGroup;
        let targetStanzaId = null;
        let targetParticipant = '';
        let targetPushName = '';
        let textoFalso = '';
        let respuesta = '¿Cómo? 😳';
        let emojiReaccion = null;
        let isDirectInGroup = false;

        // ContextInfo de mensaje citado
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        // ==========================================
        // CASO 1: Ejecutado dentro del grupo respondiendo directamente
        // ==========================================
        if (contextInfo?.stanzaId && remitente.endsWith('@g.us')) {
            targetGroupJid = remitente;
            targetStanzaId = contextInfo.stanzaId;
            targetParticipant = contextInfo.participant || '';
            isDirectInGroup = true;

            const parts = args.split('|').map(p => p.trim());
            textoFalso = parts[0] || '';
            if (parts[1]) respuesta = parts[1];
            if (parts[2]) emojiReaccion = parts[2];
        }

        // ==========================================
        // CASO 2: Mención explícita (@usuario texto falso | respuesta)
        // ==========================================
        else if (contextInfo?.mentionedJid?.[0]) {
            targetParticipant = contextInfo.mentionedJid[0];
            targetStanzaId = '3EB0' + Date.now().toString(16).toUpperCase();
            if (remitente.endsWith('@g.us')) isDirectInGroup = true;

            const cleanArgs = args.replace(/@\d+/g, '').trim();
            const parts = cleanArgs.split('|').map(p => p.trim());
            textoFalso = parts[0] || '';
            if (parts[1]) respuesta = parts[1];
            if (parts[2]) emojiReaccion = parts[2];
        }

        // ==========================================
        // CASO 3: Selección por número o ID mediante delimitador '|'
        // ==========================================
        else {
            const parts = args.split('|').map(p => p.trim());
            if (parts.length < 2) {
                return sock.sendMessage(remitente, {
                    text: `❌ Formato incompleto.\n📌 *Uso:* \`.fake3 <número_mensaje> | <texto_falso> | [respuesta]\`\n_Ejemplo:_ \`.fake3 1 | Me gusta cantar en la ducha | Jajaja lo sabía\`\nConsulta antes \`.mensajes 1\` para ver los números.`
                }, { quoted: msg });
            }

            const targetSelector = parts[0];
            textoFalso = parts[1] || '';
            if (parts[2]) respuesta = parts[2];
            if (parts[3]) emojiReaccion = parts[3];

            const selectorParts = targetSelector.split(/\s+/);

            // Subcaso: Selector de grupo y mensaje juntos (ej: "1 2" -> grupo 1, mensaje 2)
            if (selectorParts.length === 2 && !isNaN(parseInt(selectorParts[0], 10)) && !isNaN(parseInt(selectorParts[1], 10))) {
                const gIdx = parseInt(selectorParts[0], 10) - 1;
                const mIdx = parseInt(selectorParts[1], 10) - 1;
                if (global.cachedGroupList?.[gIdx]) {
                    targetGroupJid = global.cachedGroupList[gIdx].id;
                    const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                    if (buf[mIdx]) {
                        targetStanzaId = buf[mIdx].id;
                        targetParticipant = buf[mIdx].participant;
                        targetPushName = buf[mIdx].pushName;
                    }
                }
            } else if (!isNaN(parseInt(targetSelector, 10))) {
                const mIdx = parseInt(targetSelector, 10) - 1;
                if (!targetGroupJid && global.cachedGroupList?.length > 0) {
                    targetGroupJid = global.cachedGroupList[0].id;
                }

                if (targetGroupJid) {
                    const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                    if (buf[mIdx]) {
                        targetStanzaId = buf[mIdx].id;
                        targetParticipant = buf[mIdx].participant;
                        targetPushName = buf[mIdx].pushName;
                    }
                }
            } else {
                // Selector como ID directo
                targetStanzaId = targetSelector;
                if (targetGroupJid) {
                    const buf = global.recentGroupMessages.get(targetGroupJid) || [];
                    const found = buf.find(item => item.id === targetSelector);
                    if (found) {
                        targetParticipant = found.participant;
                        targetPushName = found.pushName;
                    }
                }
            }
        }

        if (!targetGroupJid) {
            return sock.sendMessage(remitente, {
                text: '❌ No hay ningún grupo objetivo seleccionado.\nUsa primero `.grupos` y luego `.mensajes 1` para definir el grupo.'
            }, { quoted: msg });
        }

        if (!textoFalso) {
            return sock.sendMessage(remitente, {
                text: '❌ Debes indicar el texto falso que deseas atribuir a la víctima.'
            }, { quoted: msg });
        }

        if (!targetStanzaId && !targetParticipant) {
            return sock.sendMessage(remitente, {
                text: '❌ No se pudo identificar el mensaje u objetivo en la memoria.\nVerifica el número con `.mensajes 1`.'
            }, { quoted: msg });
        }

        // Si no tenemos ID de mensaje, generamos uno con prefijo auténtico de WhatsApp
        if (!targetStanzaId) {
            targetStanzaId = '3EB0' + Date.now().toString(16).toUpperCase();
        }

        // ==========================================
        // RESOLUCIÓN DE IDENTIDADES: JID / LID
        // ==========================================
        let finalParticipant = targetParticipant;
        let participantPn = '';
        let participantLid = '';
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
                        participantLid = matchPart.lid || (matchPart.id?.endsWith('@lid') ? matchPart.id : '');

                        if (metadata.addressingMode === 'lid' && participantLid) {
                            finalParticipant = participantLid;
                        } else if (participantPn) {
                            finalParticipant = participantPn;
                        }
                    }
                }
            }
        } catch (e) {}

        try {
            // Destrucción de evidencia si se ejecutó en grupo
            if (isDirectInGroup && msg?.key) {
                try {
                    await sock.sendMessage(remitente, { delete: msg.key });
                } catch (err) {}
            }

            // Construcción del mensaje simulado inyectado
            const mensajeInyectado = {
                key: {
                    remoteJid: targetGroupJid,
                    fromMe: false,
                    id: targetStanzaId,
                    participant: finalParticipant || targetParticipant
                },
                message: {
                    conversation: textoFalso
                }
            };

            // Inyección del FakeQuote en el grupo objetivo
            const sentMsg = await sock.sendMessage(targetGroupJid, {
                text: respuesta
            }, {
                quoted: mensajeInyectado
            });

            // Reacción emoji opcional
            if (emojiReaccion && sentMsg?.key) {
                try {
                    await sock.sendMessage(targetGroupJid, {
                        react: {
                            text: emojiReaccion,
                            key: sentMsg.key
                        }
                    });
                } catch (e) {}
            }

            // Reporte privado si se operó remotamente
            if (!isDirectInGroup) {
                const autorDisplay = participantPn
                    ? participantPn.split('@')[0]
                    : (finalParticipant ? finalParticipant.split('@')[0] : 'Víctima');
                const nombreDisplay = targetPushName ? ` (${targetPushName})` : '';

                const reporte = `🎭 *[FAKEQUOTE INYECTADO]*\n\n`
                    + `🎯 *Víctima:* +${autorDisplay}${nombreDisplay}\n`
                    + `🆔 *Stanza ID vinculada:* \`${targetStanzaId}\`\n`
                    + `💬 *Cita falsa:* "${textoFalso}"\n`
                    + `🗣️ *Respuesta visible:* "${respuesta}"\n`
                    + `👥 *Grupo destino:* ${groupSubject}\n`
                    + `🔒 *Sigilo:* Transmitido remotamente sin rastro de comando en el grupo.`;

                return sock.sendMessage(remitente, { text: reporte }, { quoted: msg });
            }

        } catch (err) {
            console.error('[fake3] Error inyectando fakequote:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al inyectar fakequote: ${err.message}`
            }, { quoted: isDirectInGroup ? undefined : msg });
        }
    }
};
