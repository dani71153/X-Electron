// Constantes de configuracion. Nada de logica aqui.
//
// Los tiempos estan elegidos para parecer un usuario que deja X abierto, no un
// robot. Si los bajas mucho, X puede limitarte o bloquearte la cuenta.

const AJUSTES = {
  // Todas las ventanas de X comparten esta particion para compartir la sesion.
  PARTICION_SESION: 'persist:x',

  // Presentarse ante X como Chrome en vez de como Electron.
  //
  // Por defecto NO. La app llevaba dias entrando bien con el User-Agent normal
  // de Electron, asi que suplantarlo solo aporta un fingerprint INCONSISTENTE
  // (la cabecera diria Chrome pero navigator.userAgentData seguiria diciendo
  // Electron), y eso hace que el login de X se quede cargando sin dar error.
  // Ponlo en true solo si algun dia X empieza a mostrar captchas por Electron.
  SUPLANTAR_USER_AGENT: false,

  // --- Ritmo de cosecha ---

  // Cada cuanto vuelve a cosechar cada columna (ms). 5 minutos.
  CICLO_MS: 5 * 60 * 1000,

  // Descanso entre una columna y la siguiente dentro del mismo ciclo (ms).
  PAUSA_ENTRE_COLUMNAS_MS: 15 * 1000,

  // Cuantas veces baja el scroll en cada ciclo. Cada scroll cerca del fondo
  // hace que X pida la siguiente pagina de tweets. Mas scrolls = mas peticiones.
  SCROLLS_POR_CICLO: 4,

  // Espera entre un scroll y el siguiente (ms).
  INTERVALO_SCROLL_MS: 9 * 1000,

  // Pixeles que baja cada scroll.
  PIXELES_SCROLL: 900,

  // Cada cuanto se recarga la pagina de un cosechador (ms). 20 minutos.
  // Recargar es caro: una carga en frio de X dispara una rafaga de peticiones.
  RECARGA_MS: 20 * 60 * 1000,

  // Cuantas ventanas de cosecha pueden estar vivas a la vez.
  // Las ventanas se reutilizan; no se destruyen en cada ciclo.
  MAX_VENTANAS_VIVAS: 4,

  // Variacion aleatoria que se aplica a todas las esperas (0.4 = ±40%).
  // Sin esto, nuestras peticiones caen en intervalos exactos y eso se nota.
  JITTER: 0.4,

  // --- Backoff cuando X nos frena ---

  // Primera espera tras un 429 o un 403 (ms).
  BACKOFF_INICIAL_MS: 60 * 1000,

  // Tope de la espera. Se dobla en cada rechazo hasta llegar aqui.
  BACKOFF_MAX_MS: 30 * 60 * 1000,

  // --- Interfaz ---

  // Cuantos tweets pide el renderer por columna.
  TWEETS_POR_COLUMNA: 100,

  // Imprime en consola cada endpoint GraphQL que vemos.
  LOG_ENDPOINTS: true,
};

module.exports = { AJUSTES };
