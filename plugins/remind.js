// plugins/remind.js
module.exports = {
    name: 'remind',
    match: (text) => /^(?:remind|recuerdame)\s+(.+)$/i.test(text),
    execute: async ({ sock, remitente, textoLimpio, axios, PYTHON_API }) => {
        const content = textoLimpio.match(/^(?:remind|recuerdame)\s+(.+)$/i)[1].trim();
        const timeMatch = content.match(/(?:en\s+)?(\d+)\s*(m|min|minutos|h|horas|s|seg|segundos)$/i);

        if (!timeMatch) return sock.sendMessage(remitente, { text: "⚠️ Formato inválido. Ej: remind tomar pre-entreno 30m" });

        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        const task = content.replace(/(?:en\s+)?(\d+)\s*(m|min|minutos|h|horas|s|seg|segundos)$/i, '').trim();
        
        const delayMs = amount * (unit.startsWith('m') ? 60000 : unit.startsWith('h') ? 3600000 : 1000);
        await sock.sendMessage(remitente, { text: `⏱️ Aviso programado en ${amount}${unit.charAt(0)}.` });

        try {
            const aiRes = await axios.post(PYTHON_API, {
                remitente, mensaje: `Programa este recordatorio: "${task}". Respuesta directa, estricta y sin relleno.`, audio_b64: "", es_mio: true, es_respuesta_mia: false, modelo: "qwen2.5:14b"
            });
            setTimeout(() => sock.sendMessage(remitente, { text: `⏰ *RECORDATORIO*\n\n${aiRes.data.respuesta}` }), delayMs);
        } catch (e) {
            setTimeout(() => sock.sendMessage(remitente, { text: `⏰ *RECORDATORIO*\n\n${task}` }), delayMs);
        }
    }
};
