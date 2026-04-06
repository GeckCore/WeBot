const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

module.exports = {
    name: 'send',
    match: (text) => text.toLowerCase().trim().startsWith('send'),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const args = textoLimpio.trim().split(/\s+/);
        
        if (args.length < 5) {
            return sock.sendMessage(remitente, { 
                text: "❌ *Faltan datos*\n\nUso: `send [numero] [nombre] [apellido] [email]`\nEjemplo: `send 600111222 Luis Milla milla@gmail.com`" 
            }, { quoted: msg });
        }

        const [_, numero, nombre, apellido, email] = args;

        if (!/^[679]\d{8}$/.test(numero)) {
            return sock.sendMessage(remitente, { text: "❌ El número debe tener 9 dígitos y empezar por 6, 7 o 9." });
        }

        let statusMsg = await sock.sendMessage(remitente, { 
            text: `⏳ *Motor Node.js Activo*\n\n📡 *Objetivo:* ${numero}\n🚀 Ejecutando ráfaga optimizada (Puppeteer + Axios)...` 
        }, { quoted: msg });

        let exitos = 0;
        const totalWebs = 7;
        let browser;

        // Función para encontrar el ejecutable de Chrome en la VPS
        const getExecutablePath = () => {
            const paths = [
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/google-chrome',
                '/home/container/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome'
            ];
            for (const p of paths) {
                if (fs.existsSync(p)) return p;
            }
            return null;
        };

        try {
            const exePath = getExecutablePath();
            
            browser = await puppeteer.launch({
                executablePath: exePath, // Intenta usar el del sistema o el de la caché
                headless: "new",
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--disable-accelerated-2d-canvas', 
                    '--no-first-run', 
                    '--no-zygote', 
                    '--disable-gpu',
                    '--hide-scrollbars',
                    '--mute-audio'
                ]
            });

            const page = await browser.newPage();
            
            // Bloqueo de recursos innecesarios para ahorrar RAM en la VPS
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // 1. iSalud (Axios - Instantáneo)
            try {
                const res = await axios.post("https://vsec.es/llamada.php", 
                    new URLSearchParams({ name: nombre, surname: apellido, email: email, number: numero }).toString(),
                    { timeout: 5000 }
                );
                if (res.status === 200) exitos++;
            } catch (e) {}

            // 2. Securitas Direct
            try {
                await page.goto("https://www.securitasdirect.es/", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#edit-telefono1', numero);
                await page.click('#edit-submit');
                exitos++;
            } catch (e) {}

            // 3. Jazztel
            try {
                await page.goto("https://llamamegratis.es/jazztel/v2/webphone.html", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#phoneNumber', numero);
                await page.select('select[name="opcion"]', '2').catch(() => {});
                await page.click('#env');
                exitos++;
            } catch (e) {}

            // 4. Euroinnova
            try {
                await page.goto("https://www.euroinnova.com/", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#name', nombre);
                await page.type('#lastname', apellido);
                await page.type('#mail', email);
                await page.type('#tel', numero);
                await page.click('#privacidad').catch(() => {});
                await page.click('#btn_enviar');
                exitos++;
            } catch (e) {}

            // 5. Genesis
            try {
                await page.goto("https://www.genesis.es/modal/c2c", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#edit-por-quien-preguntamos-', nombre);
                await page.type('#edit-phone', numero);
                await page.type('#edit-phone-confirmation', numero);
                await page.click('label[for="edit-privacidad"]').catch(() => {});
                await page.click('#edit-actions-submit');
                exitos++;
            } catch (e) {}

            // 6. Vodafone
            try {
                await page.goto("https://www.vodafone.es/c/empresas/es/marketing-online/", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#phone', numero);
                await page.evaluate(() => {
                    document.querySelector('#cmb-gdpr')?.click();
                    document.querySelector('#cmb-check')?.click();
                });
                await page.click('input[type="submit"]');
                exitos++;
            } catch (e) {}

            // 7. Mapfre
            try {
                await page.goto("https://www.mapfre.es/boi/inicio.do?origen=autos_portalmapfre&destino=sgc_new&producto=autos", { waitUntil: 'networkidle2', timeout: 15000 });
                await page.type('#nombre', nombre);
                await page.type('#primer_apellido', apellido);
                await page.type('#tlfn', numero);
                await page.click('#politicaprivacidad').catch(() => {});
                await page.click('input[type="submit"]');
                exitos++;
            } catch (e) {}

        } catch (err) {
            console.error("Error en ráfaga:", err);
            let msgError = "❌ *Error de Navegador:* No se encontró Chrome.";
            if (err.message.includes("Could not find Chrome")) {
                msgError += "\n\nEjecuta esto en tu consola:\n`npx puppeteer browsers install chrome`";
            }
            await sock.sendMessage(remitente, { text: msgError });
        } finally {
            if (browser) await browser.close();
        }

        await sock.sendMessage(remitente, { 
            text: `✅ *Ráfaga C2C Finalizada*\n\n📈 *Éxitos:* ${exitos} de ${totalWebs} sitios.\n🚀 *Bot:* Puppeteer Engine\n\nEl objetivo recibirá las llamadas en breve.`,
            edit: statusMsg.key 
        });
    }
};
