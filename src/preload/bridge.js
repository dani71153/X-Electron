// Puente seguro entre el renderer y el proceso main.
// El renderer no tiene Node ni acceso a Electron: solo ve window.api.

const path = require('path');
const { pathToFileURL } = require('url');
const { contextBridge, ipcRenderer } = require('electron');
const { CANALES } = require('../shared/channels');
const { AJUSTES } = require('../../config/settings');

// Datos que la interfaz necesita para montar las webviews en vivo.
const CONFIG = {
  particion: AJUSTES.PARTICION_SESION,
  // El mismo preload que desactiva las passkeys, para que las webviews tampoco
  // hagan saltar Windows Hello. La webview lo pide como URL file://.
  preloadX: pathToFileURL(path.join(__dirname, 'x-inject.js')).href,
  // Cada cuanto se cosecha una columna de datos, en minutos. Para el visor.
  cicloMinutos: Math.round(AJUSTES.CICLO_MS / 60000),
};

contextBridge.exposeInMainWorld('config', CONFIG);

contextBridge.exposeInMainWorld('api', {
  listarColumnas: () => ipcRenderer.invoke(CANALES.COLUMNAS_LISTAR),
  crearColumna: (datos) => ipcRenderer.invoke(CANALES.COLUMNAS_CREAR, datos),
  borrarColumna: (id) => ipcRenderer.invoke(CANALES.COLUMNAS_BORRAR, id),
  tweetsDeColumna: (id) => ipcRenderer.invoke(CANALES.TWEETS_DE_COLUMNA, id),
  tweetsGuardados: () => ipcRenderer.invoke(CANALES.TWEETS_GUARDADOS),
  guardarTweet: (tweetId, guardado) =>
    ipcRenderer.invoke(CANALES.TWEET_GUARDAR, { tweetId, guardado }),
  exportarTweet: (tweetId) => ipcRenderer.invoke(CANALES.TWEET_EXPORTAR, tweetId),
  listarListas: () => ipcRenderer.invoke(CANALES.LISTAS_LISTAR),
  refrescarListas: () => ipcRenderer.invoke(CANALES.LISTAS_REFRESCAR),
  abrirX: () => ipcRenderer.invoke(CANALES.X_ABRIR_LOGIN),
  abrirEnX: (url) => ipcRenderer.invoke(CANALES.X_ABRIR_URL, url),
  limpiarSesionX: () => ipcRenderer.invoke(CANALES.X_LIMPIAR_SESION),
  estado: () => ipcRenderer.invoke(CANALES.ESTADO_APP),

  /** Se llama cuando una columna recibe tweets nuevos. Devuelve como desuscribirse. */
  alActualizarColumna: (callback) => {
    const manejador = (_evento, datos) => callback(datos);
    ipcRenderer.on(CANALES.COLUMNA_ACTUALIZADA, manejador);
    return () => ipcRenderer.removeListener(CANALES.COLUMNA_ACTUALIZADA, manejador);
  },

  /** Se llama cuando una columna empieza o termina de cosecharse. */
  alEstadoColumna: (callback) => {
    const manejador = (_evento, datos) => callback(datos);
    ipcRenderer.on(CANALES.COLUMNA_ESTADO, manejador);
    return () => ipcRenderer.removeListener(CANALES.COLUMNA_ESTADO, manejador);
  },

  /** Se llama cuando cambia si hay sesion iniciada en X o no. */
  alCambiarEstado: (callback) => {
    const manejador = (_evento, datos) => callback(datos);
    ipcRenderer.on(CANALES.ESTADO_CAMBIADO, manejador);
    return () => ipcRenderer.removeListener(CANALES.ESTADO_CAMBIADO, manejador);
  },
});
