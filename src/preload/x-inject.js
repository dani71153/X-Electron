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

const { contextBridge } = require('electron');

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
