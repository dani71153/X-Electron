// Cosechador puntual de listas.
//
// Abre x.com/i/lists en una ventana oculta, captura las listas del usuario, las
// guarda y se cierra. Es un solo uso (no un bucle), pensado para llamarse al
// arrancar la primera vez y cuando el usuario pulsa "Actualizar listas".

const path = require('path');
const { BrowserWindow } = require('electron');
const { AJUSTES } = require('../../../config/settings');
const { engancharInterceptor } = require('../capture/interceptor');
const { extraerListas } = require('../parse/list');
const { haySesionIniciada } = require('../session');
const consultas = require('../db/queries');
const { esperar } = require('./tiempo');

let enCurso = false;

/**
 * Captura las listas del usuario. Solo funciona con sesion iniciada.
 * @returns {Promise<number>} Cuántas listas se guardaron.
 */
async function cosecharListas() {
  if (enCurso) return 0; // ya hay una captura en marcha
  if (!(await haySesionIniciada())) {
    console.log('[listas] sin sesion: no se pueden cosechar las listas.');
    return 0;
  }

  enCurso = true;

  const ventana = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      partition: AJUSTES.PARTICION_SESION,
      preload: path.join(__dirname, '..', '..', 'preload', 'x-inject.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  const guardadas = new Set();

  const desenganchar = engancharInterceptor(ventana.webContents, {
    alRecibirTimeline: () => {},
    alFrenar: () => {},
    alRecibirListas: (json) => {
      for (const lista of extraerListas(json)) {
        consultas.guardarLista(lista);
        guardadas.add(lista.id);
      }
    },
  });

  try {
    // Las listas del usuario estan en x.com/<handle>/lists (la pestaña del
    // perfil), NO en x.com/i/lists. Primero cargamos home para leer el handle
    // del enlace de perfil, y luego vamos a la pagina de listas del perfil.
    await ventana.loadURL('https://x.com/home');
    await esperar(4500);

    const handle = await ventana.webContents
      .executeJavaScript(`
        (() => {
          const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')
                 || document.querySelector('a[aria-label][href^="/"][role="link"][data-testid$="Profile_Link"]');
          if (a) return (a.getAttribute('href') || '').replace('/', '');
          return null;
        })()
      `)
      .catch(() => null);

    const url = handle ? `https://x.com/${handle}/lists` : 'https://x.com/i/lists';
    console.log('[listas] cargando', url, handle ? `(handle: ${handle})` : '(sin handle, uso i/lists)');

    await ventana.loadURL(url);
    // Damos tiempo a que X pida y pinte las listas.
    await esperar(10000);
  } catch (error) {
    console.warn('[listas] no se pudo cargar la pagina de listas:', error.message);
  } finally {
    desenganchar();
    if (!ventana.isDestroyed()) ventana.destroy();
    enCurso = false;
  }

  console.log(`[listas] captura terminada: ${guardadas.size} listas guardadas`);
  return guardadas.size;
}

module.exports = { cosecharListas };
