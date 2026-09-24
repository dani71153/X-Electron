const path = require('path');
const { BrowserWindow } = require('electron');
const { AJUSTES } = require('../../../config/settings');
const { haySesionIniciada } = require('../session');
const consultas = require('../db/queries');

let ventana = null;
let enCurso = false;
let siguiente = 0;
let detenido = false;

function leerTendenciasDePagina() {
  if (location.pathname !== '/explore/tabs/trending') return [];
  const principal = document.querySelector('[data-testid="primaryColumn"]');
  const nombres = new Set();
  return [...(principal?.querySelectorAll('[data-testid="trend"]') || [])].flatMap((fila, indice) => {
    const lineas = fila.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const esRanking = (texto) => /^\d+[.)]?$/.test(texto)
      && Number(texto.replace(/[.)]$/, '')) === indice + 1;
    const esMeta = (texto) => /\b(posts|publicaciones|trending|tendencia|tendencias)\b/i.test(texto)
      || /^(show more|mostrar m[aá]s|ver m[aá]s)$/i.test(texto);
    const candidatos = [...fila.querySelectorAll('[dir="ltr"], [dir="auto"]')]
      .map((el) => ({ texto: el.textContent.trim(), peso: parseInt(getComputedStyle(el).fontWeight, 10) || 400 }))
      .filter(({ texto }) => texto && lineas.includes(texto) && !esRanking(texto) && !esMeta(texto));
    // X usa dir=ltr tanto para el numero de puesto como para el tema.
    // Priorizar el nombre destacado y aceptar tambien nombres con dir=auto.
    const nombre = candidatos.find(({ peso }) => peso >= 600)?.texto
      || candidatos[0]?.texto
      || lineas.find((texto) => !esRanking(texto) && !esMeta(texto));
    if (!nombre || nombres.has(nombre)) return [];
    nombres.add(nombre);
    const enlace = fila.querySelector('a[href*="/search?"]');
    return [{ nombre, consulta: enlace ? new URL(enlace.href, location.origin).searchParams.get('q') || nombre : nombre,
      contexto: lineas.slice(0, Math.max(0, lineas.indexOf(nombre))).join(' · '),
      descripcion: lineas.filter((s) => /\b(posts|publicaciones)\b/i.test(s)).join(' · '),
      posts: 0, posicion: indice + 1 }];
  });
}

async function actualizarTendenciasLocales() {
  if (detenido || enCurso || Date.now() < siguiente) return;
  enCurso = true;
  siguiente = Date.now() + 10 * 60 * 1000;
  let actual;
  let limite;
  try {
    if (!(await haySesionIniciada()) || detenido) { siguiente = Date.now() + 60000; return; }
    actual = ventana = new BrowserWindow({
      show: false, width: 1200, height: 1000,
      webPreferences: {
        partition: AJUSTES.PARTICION_SESION,
        preload: path.join(__dirname, '..', '..', 'preload', 'x-inject.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      },
    });
    await Promise.race([
      (async () => {
        await actual.loadURL('https://x.com/explore/tabs/trending');
        let anterior = '';
        for (let i = 0; i < 12; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (detenido || actual.isDestroyed()) return;
          const filas = await actual.webContents.executeJavaScript(`(${leerTendenciasDePagina.toString()})()`);
          if (detenido || actual.isDestroyed()) return;
          const firma = JSON.stringify(filas);
          if (filas.length && firma === anterior) { consultas.guardarTendencias(filas, 'explorar'); return; }
          anterior = firma;
        }
        siguiente = Date.now() + 60000;
      })(),
      new Promise((_, reject) => { limite = setTimeout(() => reject(new Error('Tiempo de captura agotado')), 30000); }),
    ]);
  } catch (error) {
    siguiente = Date.now() + 60000;
    if (!detenido) console.warn('[tendencias locales]', error.message);
  } finally {
    clearTimeout(limite);
    if (actual && !actual.isDestroyed()) actual.destroy();
    ventana = null;
    enCurso = false;
  }
}

function detenerTendenciasLocales() {
  detenido = true;
  if (ventana && !ventana.isDestroyed()) ventana.destroy();
}

function estadoTendenciasLocales() {
  return { enCurso, siguienteIntento: siguiente };
}

module.exports = { actualizarTendenciasLocales, detenerTendenciasLocales, leerTendenciasDePagina, estadoTendenciasLocales };
