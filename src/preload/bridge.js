// Puente seguro entre el renderer y el proceso main.
// El renderer no tiene Node ni acceso a Electron: solo ve window.api.

const path = require('path');
const { pathToFileURL } = require('url');
const { contextBridge, ipcRenderer } = require('electron');
const { CANALES } = require('../shared/channels');
const { CATALOGO_MODS_X } = require('../shared/x-mods');
const { AJUSTES } = require('../../config/settings');

// Datos que la interfaz necesita para montar las webviews en vivo.
const CONFIG = {
  particion: AJUSTES.PARTICION_SESION,
  // El mismo preload que desactiva las passkeys, para que las webviews tampoco
  // hagan saltar Windows Hello. La webview lo pide como URL file://.
  preloadX: pathToFileURL(path.join(__dirname, 'x-inject.js')).href,
  // Cada cuanto se cosecha una columna de datos, en minutos. Para el visor.
  cicloMinutos: Math.round(AJUSTES.CICLO_MS / 60000),

  // Catalogo para pintar Opciones y canal para aplicar los mods dentro de X.
  modsXDisponibles: CATALOGO_MODS_X,
  canalConfigurarMods: CANALES.X_CONFIGURAR_MODS,
  autoClicMs: AJUSTES.AUTO_CLIC_MS,
};

contextBridge.exposeInMainWorld('config', CONFIG);

contextBridge.exposeInMainWorld('api', {
  listarColumnas: () => ipcRenderer.invoke(CANALES.COLUMNAS_LISTAR),
  crearColumna: (datos) => ipcRenderer.invoke(CANALES.COLUMNAS_CREAR, datos),
  guardarColumnasLote: (columnas) =>
    ipcRenderer.invoke(CANALES.COLUMNAS_GUARDAR_LOTE, columnas),
  borrarColumna: (id) => ipcRenderer.invoke(CANALES.COLUMNAS_BORRAR, id),
  reordenarColumnas: (ids) => ipcRenderer.invoke(CANALES.COLUMNAS_REORDENAR, ids),
  tweetsDeColumna: (id, orden) =>
    ipcRenderer.invoke(CANALES.TWEETS_DE_COLUMNA, { id, orden }),
  tweetsGuardados: (orden) => ipcRenderer.invoke(CANALES.TWEETS_GUARDADOS, { orden }),
  guardarTweet: (tweetId, guardado) =>
    ipcRenderer.invoke(CANALES.TWEET_GUARDAR, { tweetId, guardado }),
  exportarTweet: (tweetId) => ipcRenderer.invoke(CANALES.TWEET_EXPORTAR, tweetId),
  listarListas: () => ipcRenderer.invoke(CANALES.LISTAS_LISTAR),
  refrescarListas: () => ipcRenderer.invoke(CANALES.LISTAS_REFRESCAR),
  abrirX: () => ipcRenderer.invoke(CANALES.X_ABRIR_LOGIN),
  abrirEnX: (url) => ipcRenderer.invoke(CANALES.X_ABRIR_URL, url),
  limpiarSesionX: () => ipcRenderer.invoke(CANALES.X_LIMPIAR_SESION),
  estado: () => ipcRenderer.invoke(CANALES.ESTADO_APP),
  leerAjustes: () => ipcRenderer.invoke(CANALES.AJUSTES_LEER),
  guardarAjustes: (ajustes) => ipcRenderer.invoke(CANALES.AJUSTES_GUARDAR, ajustes),
  pausarCosecha: (pausada) => ipcRenderer.invoke(CANALES.COSECHA_PAUSAR, pausada),
  exportarConfiguracion: () => ipcRenderer.invoke(CANALES.CONFIG_EXPORTAR),
  importarConfiguracion: () => ipcRenderer.invoke(CANALES.CONFIG_IMPORTAR),

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

  /** Recibe atajos capturados incluso cuando el foco esta dentro de una webview. */
  alAtajo: (callback) => {
    const manejador = (_evento, accion) => callback(accion);
    ipcRenderer.on(CANALES.ATAJO_EJECUTAR, manejador);
    return () => ipcRenderer.removeListener(CANALES.ATAJO_EJECUTAR, manejador);
  },
});
