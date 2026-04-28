document.addEventListener('DOMContentLoaded', () => {

    // Simulación de interacciones por comando
    const commandInteractions = {
        'downloads': [
            { role: 'user', text: 'Descarga este video de tiktok: https://vm.tiktok.com/ZM...' },
            { role: 'bot', text: '📥 Extrayendo multimedia sin marca de agua...', delay: 1000 },
            { role: 'bot', text: '🎥 Video descargado con éxito. Enviando archivo...', delay: 2000 }
        ],
        'play': [
            { role: 'user', text: 'play blinding lights the weeknd' },
            { role: 'bot', text: '🔍 Buscando "blinding lights the weeknd" en YouTube...', delay: 1000 },
            { role: 'bot', text: '🎵 Audio encontrado. Descargando y convirtiendo a MP3...', delay: 2000 },
            { role: 'bot', text: '✅ Audio enviado.', delay: 3500 }
        ],
        'tomp3': [
            { role: 'user', text: 'mp3 (Respondiendo a un video)' },
            { role: 'bot', text: '🔄 Convirtiendo el video a formato MP3...', delay: 1000 },
            { role: 'bot', text: '🎶 Conversión terminada. Enviando audio.', delay: 2000 }
        ],
        'webscreenshot': [
            { role: 'user', text: 'view https://github.com' },
            { role: 'bot', text: '📸 Capturando la página solicitada. Espera un momento...', delay: 1000 },
            { role: 'bot', text: '🖼️ Aquí tienes la captura de pantalla de la web.', delay: 3000 }
        ],
        'lyrics': [
            { role: 'user', text: 'letra bohemian rhapsody' },
            { role: 'bot', text: '🔍 Buscando la letra de "bohemian rhapsody"...', delay: 800 },
            { role: 'bot', text: '🎤 *Bohemian Rhapsody - Queen*\n\nIs this the real life?\nIs this just fantasy?\nCaught in a landslide...', delay: 2000 }
        ],
        'translate': [
            { role: 'user', text: 't (Respondiendo a: "Hello, how are you?")' },
            { role: 'bot', text: '🌐 *Traducción (EN -> ES)*:\n\n"Hola, ¿cómo estás?"', delay: 1000 }
        ],
        'qr': [
            { role: 'user', text: '.qr https://miweb.com' },
            { role: 'bot', text: '⬛ Generando código QR...', delay: 800 },
            { role: 'bot', text: '✅ Código QR generado. Escanéalo para visitar el enlace.', delay: 1500 }
        ],
        'readqr': [
            { role: 'user', text: '.readqr (Respondiendo a una imagen)' },
            { role: 'bot', text: '🔎 Analizando la imagen...', delay: 1000 },
            { role: 'bot', text: '📝 *Texto detectado en el QR*:\n"https://evento-secreto.com"', delay: 2000 }
        ],
        'remind': [
            { role: 'user', text: 'remind 30m Revisar los servidores' },
            { role: 'bot', text: '⏰ ¡Entendido! Te recordaré "Revisar los servidores" en 30 minutos.', delay: 1000 }
        ],
        'sticker': [
            { role: 'user', text: 's (Respondiendo a una imagen)' },
            { role: 'bot', text: '🎨 Creando sticker...', delay: 800 },
            { role: 'bot', text: '✨ Sticker generado con éxito.', delay: 1500 }
        ],
        'stickerimg': [
            { role: 'user', text: 'img (Respondiendo a un sticker)' },
            { role: 'bot', text: '🔄 Convirtiendo sticker a formato imagen...', delay: 1000 },
            { role: 'bot', text: '🖼️ Aquí tienes la imagen original.', delay: 2000 }
        ],
        'tagall': [
            { role: 'user', text: '!tagall Chicos, reunión importante' },
            { role: 'bot', text: '📢 *Mensaje para todos:*\nChicos, reunión importante\n\n@user1 @user2 @user3 @user4...', delay: 1500 }
        ],
        'grupo': [
            { role: 'user', text: '.grupo off' },
            { role: 'bot', text: '🔒 El grupo ha sido cerrado. Solo los administradores pueden enviar mensajes.', delay: 1000 }
        ],
        'warn': [
            { role: 'user', text: '.warn @spammer' },
            { role: 'bot', text: '⚠️ @spammer, has recibido una advertencia (1/3). Por favor respeta las reglas.', delay: 1000 }
        ],
        'stats': [
            { role: 'user', text: 'stats' },
            { role: 'bot', text: '📊 *Estado del Servidor*\n\n🖥️ CPU: 12%\n💾 RAM: 450MB / 2GB\n⏱️ Uptime: 45 días, 12 horas', delay: 1000 }
        ]
    };

    const commandItems = document.querySelectorAll('.command-item');
    const chatContainer = document.getElementById('chat-container');
    const fakeInput = document.getElementById('fake-input');
    const botStatus = document.getElementById('bot-status');
    const sendIcon = document.getElementById('send-icon');

    // Estado para limpiar timeouts previos
    let currentSimulationTimeouts = [];

    function clearSimulation() {
        // Limpiar timeouts
        currentSimulationTimeouts.forEach(clearTimeout);
        currentSimulationTimeouts = [];
        
        // Limpiar chat
        chatContainer.innerHTML = '';
        fakeInput.textContent = 'Escribe un mensaje...';
        fakeInput.style.color = '#8696a0';
        botStatus.textContent = 'en línea';
        botStatus.style.color = '#8696a0';
        sendIcon.className = 'bx bxs-microphone';
    }

    function addMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        
        // Convertir saltos de línea a <br>
        const formattedText = text.replace(/\n/g, '<br>');
        
        msgDiv.innerHTML = `<div class="msg-content">${formattedText}</div>`;
        chatContainer.appendChild(msgDiv);
        
        // Scroll hacia abajo
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function showTyping() {
        botStatus.textContent = 'escribiendo...';
        botStatus.style.color = '#00a884';

        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing-msg';
        typingDiv.innerHTML = `
            <div class="typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return typingDiv;
    }

    function runSimulation(cmdId) {
        clearSimulation();
        
        const sequence = commandInteractions[cmdId];
        if (!sequence) return;

        // Reset UI de comandos
        commandItems.forEach(i => i.classList.remove('active'));
        document.querySelector(`.command-item[data-cmd="${cmdId}"]`).classList.add('active');

        // Buscar el mensaje del usuario
        const userAction = sequence.find(item => item.role === 'user');
        if (!userAction) return;

        // 1. Simular tipeo en la barra inferior (fake)
        fakeInput.style.color = '#e9edef';
        fakeInput.textContent = userAction.text;
        sendIcon.className = 'bx bxs-send';

        // 2. Enviar mensaje del usuario después de 600ms
        currentSimulationTimeouts.push(setTimeout(() => {
            fakeInput.textContent = 'Escribe un mensaje...';
            fakeInput.style.color = '#8696a0';
            sendIcon.className = 'bx bxs-microphone';
            addMessage('user', userAction.text);
            
            // 3. Procesar las respuestas del bot
            const botResponses = sequence.filter(item => item.role === 'bot');
            
            let accumulatedDelay = 500; // Iniciar un poco después del msg del user
            
            botResponses.forEach((response, index) => {
                
                // Mostrar "escribiendo..." antes de la respuesta
                currentSimulationTimeouts.push(setTimeout(() => {
                    const typingIndicator = showTyping();
                    
                    // Quitar typing y mostrar mensaje
                    currentSimulationTimeouts.push(setTimeout(() => {
                        typingIndicator.remove();
                        addMessage('bot', response.text);
                        
                        // Si es el último mensaje, resetear estado
                        if (index === botResponses.length - 1) {
                            botStatus.textContent = 'en línea';
                            botStatus.style.color = '#8696a0';
                        }
                    }, response.delay || 1500));

                }, accumulatedDelay));

                accumulatedDelay += (response.delay || 1500) + 800; // Sumar tiempo para el siguiente
            });

        }, 600));
    }

    // Event Listeners
    commandItems.forEach(item => {
        item.addEventListener('click', () => {
            const cmd = item.getAttribute('data-cmd');
            runSimulation(cmd);
            
            // Scroll en móviles al panel derecho (Mockup)
            if (window.innerWidth <= 992) {
                document.querySelector('.preview-panel').scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

});
