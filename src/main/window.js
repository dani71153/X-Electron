// Creacion de ventanas: la nuestra (el tablero) y la de X (para iniciar sesion).

const path = require('path');
const { BrowserWindow } = require('electron');
const { AJUSTES } = require('../../config/settings');
const { CANALES } = require('../shared/channels');
const { normalizarModsX } = require('../shared/x-mods');

/** Traduce una tecla de Electron a una accion del tablero. */
function accionDeAtajo(entrada) {
  if (entrada.type !== 'keyDown' || entrada.isAutoRepeat) return null;

  const tecla = entrada.key.toLowerCase();
  if (entrada.alt && !entrada.control && !entrada.meta) {
    if (tecla === 'arrowleft') return 'columna-anterior';
    if (tecla === 'arrowright') return 'columna-siguiente';
    if (tecla === 'home') return 'primera-columna';
    if (tecla === 'end') return 'ultima-columna';
    return null;
  }

  if (!(entrada.control || entrada.meta) || entrada.alt) return null;
  if (!entrada.shift && tecla === 'n') return 'nueva-columna';
  if (!entrada.shift && tecla === 'r') return 'refrescar-columnas';
  if (!entrada.shift && tecla === ',') return 'abrir-opciones';
  if (!entrada.shift && tecla === 'k') return 'abrir-paleta';
  if (entrada.shift && tecla === 'b') return 'alternar-barra';
  if (entrada.shift && tecla === 'h') return 'alternar-cabeceras';
  return null;
}

/**
 * Captura atajos tanto en nuestro renderer como dentro de las webviews de X.
 * Los invitados no propagan keydown al documento anfitrion, por eso se hace
 * desde webContents y se envia una accion pequena por el puente seguro.
 */
function registrarAtajosDelTablero(ventana) {
  const alTeclado = (evento, entrada) => {
    const accion = accionDeAtajo(entrada);
    if (!accion) return;

    evento.preventDefault();
    if (!ventana.isDestroyed()) ventana.webContents.send(CANALES.ATAJO_EJECUTAR, accion);
  };

  ventana.webContents.on('before-input-event', alTeclado);
  ventana.webContents.on('did-attach-webview', (_evento, invitado) => {
    invitado.on('before-input-event', alTeclado);
  });
}

/** La ventana principal: nuestro tablero de columnas. No carga X. */
function crearVentanaPrincipal() {
  const ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0e12',
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

  registrarAtajosDelTablero(ventana);

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
let modsVentanaX = normalizarModsX();

function enviarModsVentanaX() {
  if (!ventanaX || ventanaX.isDestroyed() || ventanaX.webContents.isDestroyed()) return;

  ventanaX.webContents.send(CANALES.X_CONFIGURAR_MODS, {
    mods: modsVentanaX,
    autoClicMs: AJUSTES.AUTO_CLIC_MS,
  });
}

/** Guarda los mods y los aplica al instante si la ventana original esta abierta. */
function configurarModsVentanaX(modsX) {
  modsVentanaX = normalizarModsX(modsX, modsVentanaX);
  enviarModsVentanaX();
}

/**
 * @param {string} url
 * @param {() => void} [alCerrar] Se llama una sola vez, cuando se cierra la ventana
 * @param {object} [modsX] Configuracion vigente de mods
 */
function abrirVentanaX(url = 'https://x.com/home', alCerrar = null, modsX = null) {
  if (modsX) modsVentanaX = normalizarModsX(modsX, modsVentanaX);

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

  // El preload se crea de nuevo en cada navegacion. Reenviamos los mods cuando
  // ya esta escuchando su canal para no perder el mensaje durante la carga.
  ventanaX.webContents.on('dom-ready', enviarModsVentanaX);

  ventanaX.loadURL(url);
  ventanaX.on('closed', () => {
    ventanaX = null;
    if (alCerrar) alCerrar();
  });

  return ventanaX;
}

module.exports = {
  crearVentanaPrincipal,
  abrirVentanaX,
  configurarModsVentanaX,
  accionDeAtajo,
};
