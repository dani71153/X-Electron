// Punto de entrada de Electron. Solo arranca las piezas y las conecta.

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const { CANALES } = require('../shared/channels');
const { abrirBaseDeDatos, cerrarBaseDeDatos } = require('./db/database');
const consultas = require('./db/queries');
const { registrarIpc } = require('./ipc');
const { crearVentanaPrincipal } = require('./window');
const { GestorDeCosecha } = require('./harvest/harvester');
const { cosecharListas } = require('./harvest/listas');
const { aplicarUserAgentDeChrome } = require('./session');

let ventanaPrincipal = null;
let gestorDeCosecha = null;

// Una sola instancia. Dos copias sobre la misma particion persist:x pelean por
// los mismos archivos de cookies y cache (los errores "Acceso denegado" y "Unable
// to move the cache" al arrancar), y eso puede corromper la sesion. Si ya hay una
// abierta, esta segunda se cierra y le pasa el foco a la primera.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return; // Node envuelve el modulo en una funcion, asi que este return es valido.
}

app.on('second-instance', () => {
  if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
    if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
    ventanaPrincipal.focus();
  }
});

/** La primera vez que se abre la app, crea las columnas por defecto. */
function crearColumnasPorDefectoSiHaceFalta() {
  if (consultas.contarColumnas() > 0) return;

  const ruta = path.join(__dirname, '..', '..', 'config', 'default-columns.json');
  const columnas = JSON.parse(fs.readFileSync(ruta, 'utf8'));

  for (const columna of columnas) {
    consultas.crearColumna(columna);
  }
  console.log('[app] columnas por defecto creadas');
}

/** Avisa al renderer de que una columna tiene tweets nuevos. */
function avisarColumnaActualizada(columnaId, nuevos) {
  if (nuevos === 0) return;
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;

  ventanaPrincipal.webContents.send(CANALES.COLUMNA_ACTUALIZADA, { columnaId, nuevos });
}

/** Avisa al renderer de si hay sesion iniciada en X. */
function avisarEstadoSesion(sesionIniciada) {
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;
  ventanaPrincipal.webContents.send(CANALES.ESTADO_CAMBIADO, { sesionIniciada });
}

/** Avisa al renderer del estado de cosecha de una columna (para el visor). */
function avisarEstadoColumna(columnaId, estado) {
  if (!ventanaPrincipal || ventanaPrincipal.isDestroyed()) return;
  ventanaPrincipal.webContents.send(CANALES.COLUMNA_ESTADO, { columnaId, ...estado });
}

/** Relee las columnas de la base de datos y reinicia la cosecha. */
function reconfigurarCosecha() {
  return gestorDeCosecha.configurar(consultas.listarColumnas());
}

app.whenReady().then(() => {
  // Antes de crear ninguna ventana: el User-Agent de la particion no se puede
  // cambiar para ventanas que ya existen.
  aplicarUserAgentDeChrome();

  abrirBaseDeDatos(app.getPath('userData'));
  crearColumnasPorDefectoSiHaceFalta();

  gestorDeCosecha = new GestorDeCosecha(
    avisarColumnaActualizada,
    avisarEstadoSesion,
    avisarEstadoColumna,
  );

  registrarIpc(reconfigurarCosecha);
  ventanaPrincipal = crearVentanaPrincipal();

  // Al cerrar el tablero, cerramos la app entera.
  //
  // POR QUE HACE FALTA: las ventanas de cosecha estan ocultas (show: false), pero
  // para Electron siguen siendo ventanas. Asi que al cerrar solo el tablero,
  // 'window-all-closed' NO se dispara (quedan las ocultas), y la app se queda
  // corriendo invisible: cosechando para siempre y bloqueando la cache. Esos eran
  // los procesos huerfanos. Cerrando aqui a proposito, before-quit destruye las
  // ventanas de cosecha y todos los procesos hijos mueren con la app.
  ventanaPrincipal.on('closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  reconfigurarCosecha();

  // La primera vez (con sesion y sin listas guardadas), capturamos las listas
  // del usuario en segundo plano para que el selector no aparezca vacio.
  if (consultas.listarListas().length === 0) {
    cosecharListas().catch((e) => console.warn('[listas] captura inicial fallo:', e.message));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ventanaPrincipal = crearVentanaPrincipal();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (gestorDeCosecha) gestorDeCosecha.detener();
  cerrarBaseDeDatos();
});

// Cierre limpio al parar con Ctrl+C en la terminal (tipico en desarrollo).
// En Windows ese SIGINT no se lleva por si solo a los procesos hijos de Electron,
// asi que forzamos un app.quit() que dispara before-quit y los cierra a todos.
process.on('SIGINT', () => app.quit());

// Si algo revienta dentro del bucle de cosecha, queremos verlo y no que la app
// siga cosechando en un estado raro.
process.on('unhandledRejection', (error) => {
  console.error('[app] promesa rechazada sin capturar:', error);
});
