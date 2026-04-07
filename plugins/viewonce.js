const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = {
    name: 'ver_efimero',
    match: (text) => /^\.(ver|read|revelar)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // 1. Identificar o ID da mensagem respondida
        const targetId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;

        if (!targetId) {
            return await sock.sendMessage(remitente, { 
                text: '⚠️ *Uso:* Responda à mensagem de visualização única com `.ver`' 
            }, { quoted: msg });
        }

        if (!global.store) {
            return await sock.sendMessage(remitente, { text: '❌ Erro: O sistema de armazenamento não está ativo.' });
        }

        // 2. Extrair a mensagem original da RAM (Método Baileys)
        let originalMsg;
        try {
            originalMsg = await global.store.loadMessage(remitente, targetId);
        } catch (e) {
            console.error('Falha ao buscar no store:', e);
        }

        if (!originalMsg || !originalMsg.message) {
            return await sock.sendMessage(remitente, { 
                text: '❌ *Erro:* A mensagem não está na memória. Isso ocorre se o bot foi reiniciado ou a mensagem expirou.' 
            }, { quoted: msg });
        }

        // 3. Achatar a mensagem (Desempacotar estrutura do Baileys)
        let content = originalMsg.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;

        // 4. Buscar o nó multimídia
        const mediaTypeObj = Object.keys(content).find(k => k.endsWith('Message'));
        
        if (!mediaTypeObj) {
            return await sock.sendMessage(remitente, { text: '❌ Nenhum conteúdo multimídia detectado.' }, { quoted: msg });
        }

        const mediaMsg = content[mediaTypeObj];
        const mediaType = mediaTypeObj.replace('Message', '');

        await sock.sendMessage(remitente, { text: '⏳ *Descriptografando...*' }, { quoted: msg });

        try {
            // 5. Baixar usando a chave preservada na memória
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // 6. Enviar arquivo revelado
            if (mediaType === 'video') {
                await sock.sendMessage(remitente, { video: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'image') {
                await sock.sendMessage(remitente, { image: buffer, caption: '👁️ *Revelado*' }, { quoted: msg });
            } else if (mediaType === 'audio') {
                await sock.sendMessage(remitente, { audio: buffer, ptt: true }, { quoted: msg });
            }

        } catch (err) {
            console.error('Erro descriptografando:', err.message);
            await sock.sendMessage(remitente, { 
                text: '❌ *Falha técnica:* Não foi possível baixar. A chave criptográfica expirou ou foi destruída.' 
            }, { quoted: msg });
        }
    }
};
