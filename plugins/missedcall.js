export default {
    name: 'ghost_reaction_spam',
    match: (text) => /^\.vibrador/i.test(text),
    execute: async ({ sock, remitente, msg, quoted }) => {
        
        if (!quoted) {
            return sock.sendMessage(remitente, { text: "❌ Responde al mensaje objetivo." }, { quoted: msg });
        }

        try {
            // Sigilo
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // RECONSTRUCCIÓN MANUAL DE LA KEY (El parche para el TypeError)
            // Aseguramos de forma estricta que el remoteJid no sea nulo.
            const targetKey = {
                remoteJid: remitente,
                fromMe: quoted.key?.fromMe || false,
                id: quoted.key?.id || quoted.id,
                participant: quoted.key?.participant || quoted.participant || remitente
            };

            const iteraciones = 10;
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            const emojis = ['⚠️', '🔥', '💀', '👀', '⚡', '👁️'];

            for (let i = 0; i < iteraciones; i++) {
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                // Inyección de reacción con la key reconstruida
                await sock.sendMessage(remitente, { 
                    react: { text: randomEmoji, key: targetKey } 
                });

                await delay(300); 

                // Retiro de reacción
                await sock.sendMessage(remitente, { 
                    react: { text: '', key: targetKey } 
                });

                await delay(200); 
            }

        } catch (err) {
            console.error("Falla en bucle háptico:", err);
        }
    }
};
