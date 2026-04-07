import ws from 'ws';
import fs from 'fs';
import path from 'path';

export default {
    name: 'listjadibot',
    // Soporta los alias: .listjadibot, .bots, .subsbots
    match: (text) => /^\.(listjadibot|bots|subsbots)$/i.test(text),

    execute: async ({ sock, remitente, msg, textoLimpio }) => {
        // 1. Gestión de Idioma y Traducción (Siguiendo tu base de datos)
        const datas = global;
        const user = datas.db.data.users[msg.sender] || {};
        const idioma = user.language || 'es'; // 'es' como fallback
        
        let tradutor;
        try {
            const pathLang = path.join(process.cwd(), 'src', 'languages', `${idioma}.json`);
            const _translate = JSON.parse(fs.readFileSync(pathLang, 'utf8'));
            tradutor = _translate.plugins.mipilot_serbot_info;
        } catch (e) {
            // Fallback manual si no existe el archivo de idioma para no romper el comando
            tradutor = {
                texto1: 'No hay sub-bots activos en este momento.',
                texto2: ['✨ *LISTA DE SUB-BOTS ACTIVOS* ✨', '', 'Bots conectados:', 'Total:'],
                texto3: ['d ', 'h ', 'm ', 's'],
                texto4: ['Enlace:', 'Nombre:', 'Tiempo activo:']
            };
        }

        // 2. Filtrar conexiones activas
        if (!global.conns) global.conns = [];
        const users = global.conns.filter(conn => 
            conn.user && 
            conn.ws?.socket && 
            conn.ws.socket.readyState !== ws.CLOSED
        );

        // 3. Función de formato de tiempo
        function convertirMs(ms) {
            let segundos = Math.floor(ms / 1000);
            let minutos = Math.floor(segundos / 60);
            let horas = Math.floor(minutos / 60);
            let dias = Math.floor(horas / 24);
            segundos %= 60; minutos %= 60; horas %= 24;

            let res = "";
            if (dias !== 0) res += dias + tradutor.texto3[0];
            if (horas !== 0) res += horas + tradutor.texto3[1];
            if (minutos !== 0) res += minutos + tradutor.texto3[2];
            if (segundos !== 0) res += segundos + tradutor.texto3[3];
            return res || "0s";
        }

        // 4. Construcción del mensaje
        const message = users.map((v, index) => {
            const jid = v.user.jid || v.user.id;
            const pureJid = jid.split(':')[0];
            const uptime = v.uptime ? convertirMs(Date.now() - v.uptime) : "Desconocido";
            
            return `*${index + 1}.-* @${pureJid}\n${tradutor.texto4[0]} wa.me/${pureJid}\n${tradutor.texto4[1]} ${v.user.name || '-'}\n${tradutor.texto4[2]} ${uptime}`;
        }).join('\n\n');

        const replyMessage = message.length === 0 ? tradutor.texto1 : message;
        const totalUsers = users.length;
        
        const responseMessage = `
${tradutor.texto2[0]}
${tradutor.texto2[1]}
${tradutor.texto2[2]}
${tradutor.texto2[3]} ${totalUsers || '0'}

${replyMessage.trim()}`.trim();

        // 5. Envío con menciones
        const mentions = [...responseMessage.matchAll(/@([0-9]{5,16})/g)].map(v => v[1] + '@s.whatsapp.net');

        await sock.sendMessage(remitente, { 
            text: responseMessage, 
            mentions: mentions 
        }, { quoted: msg });
    }
};
