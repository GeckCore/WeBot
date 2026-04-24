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
                "CRITICAL_ERROR: Stack buffer overflow at 0x0004F2 - Process terminated.",
                "STATUS_DEVICE_NOT_READY: The physical drive responded with a non-retryable error.",
                "SYNC_FAILURE: Hash mismatch detected in local metadata. Operation aborted.",
                "KERNEL_THREAD_PANIC: IRQ_NOT_LESS_OR_EQUAL (0x0000000A)...",
                "PROTOCOL_TIMEOUT: Handshake failed after 3000ms. Remote host unreachable.",
                "ACCESS_DENIED: User lacks 'ROOT_EXECUTE' privileges for this binary.",
                "FATAL: Memory allocation failed (OOM). Pointer returned NULL."            ];

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
