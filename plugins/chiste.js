export default {
    name: 'chistes_negros',
    // Captura .chiste o .joke
    match: (text) => /^\.(chiste|joke)$/i.test(text),

    execute: async ({ sock, remitente, msg }) => {
        // 1. Lista Maestra de Chistes (Tus chistes + nuevos del mismo estilo)
        const listaChistes = [
            "— ¿Cuál es la diferencia entre un judío y un niño con cáncer?\n— Que el niño con cáncer no llega a los sesenta.",
            "¿Cuántas mujeres hacen falta para armar una manifestación feminista? -1 (menos una).",
            "¿En qué son iguales un lego y un cura? En que ambos terminan en la boca del niño.",
            "— ¿Cuál es la diferencia entre una pizza y un judío?\n— Que la pizza no grita cuando la metes al horno.",
            "— ¿Qué es lo que tiene más de 100 piernas y no puede caminar?\n— Un hospital infantil en Gaza.",
            "— ¿Qué es lo que separa a los humanos de los animales?\n— El mar Mediterráneo.",
            "— ¿Qué es lo que tiene 10 brazos y un coeficiente intelectual de 200?\n— Un grupo de 5 niños con síndrome de Down en una clase de mates.",
            "— ¿Qué es lo más blanco que tiene un negro?\n— A su dueño.",
            "— ¿En qué se parecen un niño rico y un niño con leucemia?\n— En que a los dos les compran el coche antes de que tengan edad para conducirlo.",
            "— ¿Qué es lo que separa a un gitano de un puesto de trabajo?\n— Una patrulla de la Guardia Civil.",
            "Sabe usted porque yo también uso zapatillas blancas como usted?\nPorque mama me las bolas negras, entonces estoy usando las zapatillas blancas.",
            "¿Qué haces después de abusar de un mudo? Le partes los dedos para que no le diga a nadie.",
            "— ¿Por qué los niños con leucemia no juegan al escondite?\n— Porque cuando los encuentran, ya no están.",
            // --- NUEVOS AGREGADOS ---
            "¿Qué es lo que tiene 4 piernas por la mañana, 2 al mediodía y ninguna por la noche? Un superviviente de una mina antipersona.",
            "¿Cuál es la diferencia entre un trampolín y un bebé muerto? Que para el trampolín te quitas las botas.",
            "¿Por qué los huérfanos no pueden jugar al béisbol? Porque no saben dónde está la 'home' (casa).",
            "¿Qué es amarillo y si le das a un botón se vuelve rojo? Un pollito en una batidora.",
            "¿En qué se parece un cura a un árbol? En que los dos dan frutos prohibidos.",
            "¿Cuál es la diferencia entre un cura y un acné? En que el acné espera a que el niño tenga 13 años para salirle en la cara.",
            "¿Por qué en África no ven 'Los Simpson'? Porque no se puede ver la tele con el estómago vacío.",
            "¿Qué hace un leproso tocando la guitarra? Carne picada.",
            "¿Cómo se llama el último modelo de juguete para niños en Gaza? El 'Nenuco Desmembrado'.",
            "¿Qué es lo mejor de tener Alzheimer? Que cada día conoces gente nueva y los chistes siempre son estrenos."
        ];

        // 2. Gestión de memoria (Base de Datos) para evitar repeticiones
        if (!global.db.data.chats[remitente]) {
            global.db.data.chats[remitente] = { chistes_vistos: [] };
        }
        
        let chatData = global.db.data.chats[remitente];
        if (!chatData.chistes_vistos) chatData.chistes_vistos = [];

        // Si ya vimos todos, reiniciamos la lista para este chat
        if (chatData.chistes_vistos.length >= listaChistes.length) {
            chatData.chistes_vistos = [];
        }

        // 3. Selección de chiste no repetido
        let indicesDisponibles = listaChistes
            .map((_, i) => i)
            .filter(i => !chatData.chistes_vistos.includes(i));

        const randomIndex = indicesDisponibles[Math.floor(Math.random() * indicesDisponibles.length)];
        const chisteSeleccionado = listaChistes[randomIndex];

        // Guardar en base de datos
        chatData.chistes_vistos.push(randomIndex);
        
        // 4. Envío
        await sock.sendMessage(remitente, { 
            text: `🃏 *CHISTE FUNABLE* 🃏\n\n${chisteSeleccionado}` 
        }, { quoted: msg });
    }
};
