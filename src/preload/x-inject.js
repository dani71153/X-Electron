// Preload que corre DENTRO de las paginas de x.com (cosechadores y ventana visible).
//
// Hace una sola cosa importante: desactivar las passkeys (WebAuthn).
//
// POR QUE: la pantalla de login de X llama a navigator.credentials.get() con
// "mediacion condicional" nada mas cargar, y Chrome responde abriendo el dialogo
// de Windows Hello. En los cosechadores, que son ventanas ocultas, ese dialogo
// aparecia sin origen visible y se repetia en cada rotacion de turno.
//
// CONSECUENCIA ACEPTADA: tampoco se puede usar passkey para iniciar sesion en X
// desde esta app. Hay que entrar con usuario y contraseña. Tambien deja de
// funcionar "Iniciar sesion con Google" (One Tap), que usa la misma API.
//
// POR QUE executeInMainWorld Y NO UN SCRIPT NORMAL:
// con contextIsolation, este preload vive en un mundo aislado. Si aqui hicieramos
// `navigator.credentials.get = ...`, estariamos cambiando NUESTRA copia, no la que
// ve el codigo de X. executeInMainWorld ejecuta la funcion en el mundo de la pagina.
//
// El preload corre antes que cualquier script de la pagina, asi que X ya se
// encuentra la API desactivada cuando arranca.
//
// (Se intento con el depurador y Page.addScriptToEvaluateOnNewDocument, pero en
// Electron los comandos CDP no resuelven hasta que la ventana ha cargado algo,
// y para entonces ya es tarde.)

const { contextBridge, ipcRenderer } = require('electron');

function desactivarPasskeys() {
  const rechazar = () =>
    Promise.reject(new DOMException('WebAuthn desactivado por X-Electron', 'NotAllowedError'));

  if (window.navigator && navigator.credentials) {
    navigator.credentials.get = rechazar;
    navigator.credentials.create = rechazar;
  }

  // X consulta esto ANTES de pedir la passkey. Diciendo que no hay autenticador,
  // ni siquiera lo intenta y no aparece ningun dialogo.
  if (window.PublicKeyCredential) {
    PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
  }
}

if (typeof contextBridge.executeInMainWorld === 'function') {
  contextBridge.executeInMainWorld({ func: desactivarPasskeys });
} else {
  // Electron viejo. Preferimos avisar a fallar en silencio y que salte Windows Hello.
  console.error('[x-inject] executeInMainWorld no existe: NO se han desactivado las passkeys');
}

// --- Auto-clic en "Mostrar N posts" ---
//
// Cuando llegan posts nuevos, X saca arriba del timeline un boton tipo pastilla
// ("Mostrar 35 posts"). Si el usuario lo pide, lo pulsamos nosotros.
//
// AQUI NO HACE FALTA executeInMainWorld: el contexto esta aislado, pero el DOM es
// EL MISMO. Buscar un elemento y pulsarlo funciona desde aqui sin tocar el mundo
// de la pagina, que es mas seguro.
//
// ARRANCA APAGADO A PROPOSITO: este preload lo usan tambien los cosechadores
// (ventanas ocultas). Solo se enciende cuando el tablero manda el mensaje, y solo
// se lo manda a las columnas en vivo.

// Debe coincidir con CANALES.X_AUTO_MOSTRAR_POSTS de src/shared/channels.js.
// Se repite el texto porque este preload corre en sandbox y no puede hacer
// require() de archivos nuestros: solo del modulo 'electron'.
const CANAL_AUTO_MOSTRAR = 'x:autoMostrarPosts';

let temporizadorAutoClic = null;

/** Pulsa el boton de posts nuevos si esta en pantalla. Devuelve true si lo pulso. */
function pulsarPostsNuevos() {
  // pillLabel es el texto de dentro ("Mostrar 35 posts"); lo que se puede pulsar
  // es su ancestro con role="button". Nos apoyamos en data-testid porque las
  // clases de X son generadas y cambian solas.
  const etiqueta = document.querySelector('[data-testid="pillLabel"]');
  if (!etiqueta) return false;

  const boton = etiqueta.closest('[role="button"]');
  if (!boton) return false;

  boton.click();
  return true;
}

/** Igual que en la cosecha: nunca dos esperas iguales seguidas. */
function conJitter(ms) {
  const variacion = ms * 0.4;
  return ms - variacion + Math.random() * variacion * 2;
}

/**
 * Se reprograma con setTimeout en cada vuelta, no con setInterval: asi cada
 * espera lleva un jitter distinto y nunca se solapan dos comprobaciones.
 */
function programarAutoClic(intervaloMs) {
  temporizadorAutoClic = setTimeout(() => {
    pulsarPostsNuevos();
    programarAutoClic(intervaloMs);
  }, conJitter(intervaloMs));
}

function configurarAutoClic({ activo, intervaloMs }) {
  if (temporizadorAutoClic) {
    clearTimeout(temporizadorAutoClic);
    temporizadorAutoClic = null;
  }

  if (activo) programarAutoClic(intervaloMs);
}

ipcRenderer.on(CANAL_AUTO_MOSTRAR, (_evento, datos) => configurarAutoClic(datos));
