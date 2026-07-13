// Creacion de ventanas: la nuestra (el tablero) y la de X (para iniciar sesion).

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { AJUSTES } = require('../../config/settings');

const RUTA_CSS_X = path.join(__dirname, '..', 'preload', 'x-styles.css');

/**
 * Mete nuestro CSS dentro de la pagina de X.
 * Lo hacemos desde main para que el preload pueda seguir en sandbox: X es
 * codigo que no controlamos, no queremos darle un preload con acceso a Node.
 */
function inyectarEstilosEnX(webContents) {
  webContents.on('did-finish-load', () => {
    const css = fs.readFileSync(RUTA_CSS_X, 'utf8');
    webContents.insertCSS(css).catch((error) => {
      console.error('[window] no se pudo inyectar el CSS en X:', error.message);
    });
  });
}

/** La ventana principal: nuestro tablero de columnas. No carga X. */
function crearVentanaPrincipal() {
  const ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#15202b',
    title: 'X-Electron',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'bridge.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Permite las columnas en vivo (<webview> que embebe x.com).
      webviewTag: true,
    },
  });

  ventana.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    ventana.webContents.openDevTools({ mode: 'detach' });
  }

  return ventana;
}

/**
 * La X original, visible. Se usa para iniciar sesion y para lo que no
 * reimplementamos (escribir un tweet, ajustes de cuenta...).
 * Comparte particion con los cosechadores, asi la sesion es la misma.
 */
let ventanaX = null;

/**
 * @param {string} url
 * @param {() => void} [alCerrar] Se llama una sola vez, cuando se cierra la ventana
 */
function abrirVentanaX(url = 'https://x.com/home', alCerrar = null) {
  // Si ya estaba abierta no la recreamos, solo la traemos al frente.
  // El listener de cierre ya quedo registrado la primera vez.
  if (ventanaX && !ventanaX.isDestroyed()) {
    ventanaX.focus();
    ventanaX.loadURL(url);
    return ventanaX;
  }

  ventanaX = new BrowserWindow({
    width: 1100,
    height: 900,
    title: 'X.com',
    webPreferences: {
      partition: AJUSTES.PARTICION_SESION,
      // Este preload desactiva las passkeys. Por eso el login es con contraseña.
      preload: path.join(__dirname, '..', 'preload', 'x-inject.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  inyectarEstilosEnX(ventanaX.webContents);

  ventanaX.loadURL(url);
  ventanaX.on('closed', () => {
    ventanaX = null;
    if (alCerrar) alCerrar();
  });

  return ventanaX;
}

module.exports = { crearVentanaPrincipal, abrirVentanaX };
