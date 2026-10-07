import { delay } from '@whiskeysockets/baileys';

export default {
    name: 'fakemessage',
    // Activación: 'hola' directo, 'h <texto>' (sigilo con edición a 'hola'), o 'm <texto>'
    match: (text) => /^(hola$|h(\s+|$)|m(\s+|$))/i.test((text || '').trim()),

    execute: async ({ sock, msg, remitente, textoLimpio, quoted, msgType }) => {
        const isGroup = remitente.endsWith('@g.us');
        if (!isGroup) {
            return sock.sendMessage(remitente, { 
                text: 'Este comando solo se puede usar en grupos..' 
            }, { quoted: msg });
        }

        // Obtener contextInfo de texto o de multimedia citada
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo
            || msg.message?.imageMessage?.contextInfo
            || msg.message?.videoMessage?.contextInfo
            || (msgType ? msg.message?.[msgType]?.contextInfo : null);

        const hasQuoted = Boolean(quoted || contextInfo?.quotedMessage);
        const stanzaId = contextInfo?.stanzaId;

        if (!hasQuoted) {
            return sock.sendMessage(remitente, { 
                text: 'Responda al mensaje que desea procesar.' 
            }, { quoted: msg });
        }

        // Determinar el texto de reemplazo y si debe camuflarse editando a 'hola'
        let text = 'Me gusta el pne';
        let shouldEditToHola = false;

        if (/^h\s+/i.test(textoLimpio)) {
            const customText = textoLimpio.replace(/^h\s*/i, '').trim();
            if (customText) text = customText;
            shouldEditToHola = true;
        } else if (/^h$/i.test(textoLimpio)) {
            shouldEditToHola = true;
        } else if (/^m\s+/i.test(textoLimpio)) {
            const customText = textoLimpio.replace(/^m\s*/i, '').trim();
            if (customText) text = customText;
        }

        if (!text) {
            return sock.sendMessage(remitente, { 
                text: 'Introduzca el texto de reemplazo.' 
            }, { quoted: msg });
        }

        if (!stanzaId) {
            return sock.sendMessage(remitente, { 
                text: '❌ No se pudo identificar el ID del mensaje citado.' 
            }, { quoted: msg });
        }

        try {
            const tempId = await sock.relayMessage(
                remitente,
                {
                    extendedTextMessage: {
                        text: '',
                        contextInfo: {
                            isGroupStatus: true
                        }
                    }
                },
                {
                    quoted: msg
                }
            );

            await sock.relayMessage(
                remitente,
                {
                    protocolMessage: {
                        key: {
                            jid: remitente,
                            fromMe: true,
                            id: tempId
                        },
                        type: 14,
                        editedMessage: {
                            extendedTextMessage: {
                                text,
                                contextInfo: {
                                    isGroupStatus: false
                                }
                            }
                        }
                    }
                },
                {
                    messageId: stanzaId
                }
            );

            // Modo Sigilo: Editar el mensaje original del usuario para camuflarlo como 'hola'
            if (shouldEditToHola && msg?.key) {
                try {
                    const editWord = textoLimpio.startsWith('H') ? 'Hola' : 'hola';
                    await sock.sendMessage(remitente, {
                        text: editWord,
                        edit: msg.key
                    });
                } catch (err) {
                    console.error('[fakemsg] Error camuflando mensaje a hola:', err.message);
                }
            }
        } catch (e) {
            console.error('[fakemsg]', e);
            await sock.sendMessage(remitente, { 
                text: 'Error: ' + (e?.message || e) 
            }, { quoted: msg });
        }
    }
};
