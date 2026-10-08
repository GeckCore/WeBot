// plugins/verificado.js

module.exports = {
    name: 'verificado',
    match: (text) => /^\.(verificado|oficial|verified|meta)(\s+.*|$)/i.test((text || '').trim()),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        global.cachedGroupList = global.cachedGroupList || [];

        const isGroup = remitente.endsWith('@g.us');
        const rawInput = (textoLimpio || '').replace(/^\.(verificado|oficial|verified|meta)\s*/i, '').trim();

        if (!rawInput) {
            const ayuda = "❌ *Formato incorrecto.*\n\n📌 *Uso directo en grupo:*\n• `.verificado <texto>`\n• `.verificado <entidad> | <texto>`\n_Ejemplo:_ `.verificado WhatsApp | Tu cuenta ha sido verificada con éxito.`\n\n🌐 *Uso remoto desde privado:*\n• `.verificado <num_grupo> | <texto>`\n• `.verificado <num_grupo> | <entidad> | <texto>`\n_O selecciona el grupo con `.grupos` y `.mensajes <número>`._";
            return sock.sendMessage(remitente, { text: ayuda }, { quoted: msg });
        }

        // Función para asegurar la lista de grupos en memoria
        const asegurarListaGrupos = async () => {
            if (!global.cachedGroupList.length) {
                try {
                    const participating = await sock.groupFetchAllParticipating();
                    const list = Object.values(participating);
                    global.cachedGroupList = list.map((g, index) => ({
                        index: index + 1,
                        id: g.id,
                        subject: g.subject || 'Sin nombre',
                        participantsCount: g.participants?.length || 0
                    }));
                } catch (e) {}
            }
        };

        let targetJid = isGroup ? remitente : null;
        let groupSubject = 'el grupo';
        let entidad = 'WhatsApp';
        let textoMensaje = '';

        const parts = rawInput.split('|').map(p => p.trim());

        if (!isGroup) {
            // ==========================================
            // MODO REMOTO (Desde chat privado a grupo)
            // ==========================================
            let groupIdx = null;

            // Caso A: Empieza con número de grupo: .verificado 1 | ...
            if (parts.length >= 2 && !isNaN(parseInt(parts[0], 10))) {
                groupIdx = parseInt(parts[0], 10);
                await asegurarListaGrupos();

                const found = global.cachedGroupList.find(g => g.index === groupIdx);
                if (found) {
                    targetJid = found.id;
                    groupSubject = found.subject;
                    global.lastViewedGroup = targetJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: `❌ Grupo [${groupIdx}] no encontrado. Usa primero \`.grupos\` para ver la lista.`
                    }, { quoted: msg });
                }

                if (parts.length >= 3) {
                    // .verificado 1 | Meta | Texto
                    entidad = parts[1] || 'WhatsApp';
                    textoMensaje = parts.slice(2).join('|').trim();
                } else {
                    // .verificado 1 | Texto
                    textoMensaje = parts[1];
                }

            } else {
                // Caso B: Usar grupo previamente visto (.mensajes <num>)
                await asegurarListaGrupos();
                if (global.lastViewedGroup) {
                    targetJid = global.lastViewedGroup;
                    const found = global.cachedGroupList.find(g => g.id === targetJid);
                    if (found) groupSubject = found.subject;
                } else if (global.cachedGroupList.length > 0) {
                    targetJid = global.cachedGroupList[0].id;
                    groupSubject = global.cachedGroupList[0].subject;
                    global.lastViewedGroup = targetJid;
                } else {
                    return sock.sendMessage(remitente, {
                        text: "❌ No hay ningún grupo seleccionado.\n📌 *Uso:* Primero usa `.grupos` y `.mensajes <número>`, o especifica: `.verificado <número_grupo> | <texto>`"
                    }, { quoted: msg });
                }

                if (parts.length >= 2) {
                    // .verificado Meta | Texto
                    entidad = parts[0];
                    textoMensaje = parts.slice(1).join('|').trim();
                } else {
                    // .verificado Texto
                    textoMensaje = rawInput;
                }
            }

        } else {
            // ==========================================
            // MODO DIRECTO (En el propio grupo)
            // ==========================================
            if (parts.length >= 2) {
                // .verificado Meta | Texto
                entidad = parts[0];
                textoMensaje = parts.slice(1).join('|').trim();
            } else {
                // .verificado Texto
                textoMensaje = rawInput;
            }
        }

        if (!textoMensaje) {
            return sock.sendMessage(remitente, {
                text: "⚠️ Debes escribir el texto que deseas enviar con el tick verificado."
            }, { quoted: msg });
        }

        // Mapeo y formateo de entidad verificada
        const canalJid = '120363161512013000@newsletter'; // Canal oficial verificado de WhatsApp / Meta
        let canalNombre = entidad;

        const entidadNorm = entidad.toLowerCase();
        if (entidadNorm === 'meta') canalNombre = 'Meta';
        else if (entidadNorm === 'meta ai' || entidadNorm === 'metaai') canalNombre = 'Meta AI';
        else if (entidadNorm === 'whatsapp') canalNombre = 'WhatsApp';
        else if (entidadNorm === 'soporte') canalNombre = 'WhatsApp Support';

        const payload = {
            text: textoMensaje,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: canalJid,
                    newsletterName: canalNombre,
                    serverMessageId: 1
                }
            }
        };

        try {
            if (isGroup) {
                // En grupo: borrar comando original para sigilo
                try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}
                await sock.sendMessage(targetJid, payload);
            } else {
                // En privado: enviar al grupo y confirmar
                await sock.sendMessage(targetJid, payload);
                await sock.sendMessage(remitente, {
                    text: `✅ *Mensaje verificado (${canalNombre} ✔) enviado a:* ${groupSubject}\n\n📄 *Contenido:* ${textoMensaje}`
                }, { quoted: msg });
            }
        } catch (err) {
            console.error('[verificado] Error enviando mensaje verificado:', err);
            return sock.sendMessage(remitente, {
                text: `❌ Error al enviar mensaje verificado: ${err.message}`
            }, { quoted: msg });
        }
    }
};
