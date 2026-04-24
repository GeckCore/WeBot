let schizoIntervals = {};

export default {
    name: 'quantum_message',
    match: (text) => /^\.schizo/i.test(text),
    execute: async ({ sock, remitente, msg }) => {
        
        // Toggle para apagarlo
        if (schizoIntervals[remitente]) {
            clearInterval(schizoIntervals[remitente]);
            delete schizoIntervals[remitente];
            return sock.sendMessage(remitente, { text: "✅ Bucle cuántico cerrado." });
        }

        try {
            // 1. Sigilo: Borramos el comando inicial
            try { await sock.sendMessage(remitente, { delete: msg.key }); } catch (e) {}

            // 2. Estados del mensaje (puedes añadir los que quieras)
            const estados = [
                "⚠️ ERROR DE SISTEMA: 0x001",
                "📡 Sincronizando datos con Meta...",
                "👁️ Te estoy observando.",
                "⌛ Mensaje autodestruyéndose...",
                "🤖 [BOT] Protocolo de defensa activo.",
                "❌ ACCESO DENEGADO",
                "🔓 ACCESO CONCEDIDO",
                "🌀 Glitch en la realidad detectado."
            ];

            // 3. Envío del mensaje base
            const quantumMsg = await sock.sendMessage(remitente, { text: estados[0] });

            // 4. Bucle de edición (Cada 800ms para ser agresivo pero seguro)
            let i = 0;
            schizoIntervals[remitente] = setInterval(async () => {
                i = (i + 1) % estados.length;
                
                await sock.sendMessage(remitente, {
                    text: estados[i],
                    edit: quantumMsg.key // Aquí ocurre la magia
                });
            }, 800);

            // Auto-stop a los 2 minutos para no quemar el número
            setTimeout(() => {
                if (schizoIntervals[remitente]) {
                    clearInterval(schizoIntervals[remitente]);
                    delete schizoIntervals[remitente];
                }
            }, 120000);

        } catch (err) {
            console.error("Error en Quantum Message:", err);
            if (schizoIntervals[remitente]) clearInterval(schizoIntervals[remitente]);
        }
    }
};
