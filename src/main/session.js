// Todo lo que tiene que ver con la sesion de X: saber si esta iniciada,
// limpiarla, y decidir como nos presentamos ante X (el User-Agent).
//
// Importa mucho: si no hay sesion, X manda a los cosechadores a la pantalla de
// login. Esa pantalla pide passkey (Windows Hello) nada mas cargar, asi que
// cosechar sin sesion hace saltar el dialogo de Windows una y otra vez.
// Por eso no se cosecha nada hasta que hay sesion.

const { app, session } = require('electron');
const { AJUSTES } = require('../../config/settings');

// X guarda estas dos cookies cuando has iniciado sesion.
// auth_token es la sesion; ct0 es el token anti-CSRF.
const COOKIES_DE_SESION = ['auth_token', 'ct0'];

function sesionDeX() {
  return session.fromPartition(AJUSTES.PARTICION_SESION);
}

/**
 * ¿Estan las cookies de sesion?
 *
 * OJO: esto solo dice que las cookies EXISTEN, no que X las siga aceptando.
 * X puede invalidar la sesion en su servidor y las cookies se quedan aqui tan
 * tranquilas. Cuando eso pasa, quien lo detecta es el cosechador: X lo manda a
 * la pantalla de login y entonces paramos (ver harvester.js).
 */
async function haySesionIniciada() {
  const cookies = await sesionDeX().cookies.get({ domain: '.x.com' });

  const nombres = new Set(cookies.map((c) => c.name));
  return COOKIES_DE_SESION.every((nombre) => nombres.has(nombre));
}

/**
 * Borra la sesion de X: cookies y todo el almacenamiento de la particion.
 *
 * POR QUE HACE FALTA: cuando X invalida la sesion desde su servidor, las cookies
 * viejas (auth_token muerto, ct0 viejo) se quedan aqui. El flujo de login de X
 * manda cada paso a su API con esas cookies y con el x-csrf-token sacado del ct0
 * viejo; X responde 403 y el login se queda a medias: metes la contraseña y
 * vuelve al principio sin decir por que. Con las cookies limpias, el login
 * arranca de cero y funciona.
 */
async function limpiarSesionX() {
  const ses = sesionDeX();

  await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers'] });
  await ses.clearCache();

  console.log('[sesion] sesion de X borrada (cookies y almacenamiento)');
}

/**
 * Quita de nuestro User-Agent los trozos que delatan que esto es Electron.
 *
 * El User-Agent por defecto es algo como:
 *   Mozilla/5.0 (...) x-electron/0.1.0 Chrome/142.0.0.0 Electron/43.1.0 Safari/537.36
 * Quitando los dos trozos con "electron/" queda un User-Agent de Chrome normal.
 * No inventamos una version de Chrome: usamos la que de verdad trae Electron.
 */
function userAgentSinElectron(porDefecto) {
  return porDefecto
    .replace(/\S*[Ee]lectron\/[\d.]+\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Hace que las ventanas de X se presenten como un Chrome normal.
 *
 * POR QUE: por defecto le decimos a X que somos Electron, tanto en el User-Agent
 * como en las cabeceras Sec-CH-UA. Con la sesion ya iniciada X lo tolera, pero
 * el login es donde mas mira quien eres y ahi te puede meter un captcha que en
 * esta ventana no hay forma de resolver.
 *
 * Hay que llamarlo ANTES de crear ninguna ventana: setUserAgent no afecta a las
 * que ya existen.
 *
 * Desactivado por defecto (AJUSTES.SUPLANTAR_USER_AGENT). Ver el comentario del
 * ajuste: la suplantacion parcial deja un fingerprint inconsistente que atasca
 * el login de X.
 */
function aplicarUserAgentDeChrome() {
  if (!AJUSTES.SUPLANTAR_USER_AGENT) return;

  const ses = sesionDeX();
  const ua = userAgentSinElectron(app.userAgentFallback);
  const versionChrome = process.versions.chrome.split('.')[0];

  ses.setUserAgent(ua);

  // El User-Agent no es el unico sitio donde aparece "Electron": Chromium manda
  // ademas la cabecera Sec-CH-UA con la lista de "marcas" del navegador, y ahi
  // Electron se pone a si mismo. La reescribimos para que diga Google Chrome.
  ses.webRequest.onBeforeSendHeaders((detalles, callback) => {
    const cabeceras = detalles.requestHeaders;

    if (cabeceras['sec-ch-ua']) {
      cabeceras['sec-ch-ua'] = cabeceras['sec-ch-ua'].replace(
        /"Electron";v="[\d.]+"/,
        `"Google Chrome";v="${versionChrome}"`,
      );
    }

    callback({ requestHeaders: cabeceras });
  });

  console.log('[sesion] User-Agent de X:', ua);
}

module.exports = { haySesionIniciada, limpiarSesionX, aplicarUserAgentDeChrome };
