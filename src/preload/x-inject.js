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

// --- Mods de X ---
//
// Son mejoras opcionales para las vistas que ve el usuario. Los cosechadores
// tambien cargan este preload, pero nunca reciben el mensaje de configuracion y
// por tanto no activan ningun mod.
//
// Los mods de DOM y CSS corren en el mundo aislado. El DOM es compartido con la
// pagina, pero el JavaScript de X no obtiene acceso a Node ni a nuestro IPC.

// Debe coincidir con CANALES.X_CONFIGURAR_MODS de src/shared/channels.js.
// Se repite el texto porque un preload sandboxed solo puede require('electron').
const CANAL_CONFIGURAR_MODS = 'x:configurarMods';
const ATRIBUTO_ESTILO_MOD = 'data-x-electron-mod';

function configurarEstilos(id, css, activo) {
  const selector = `style[${ATRIBUTO_ESTILO_MOD}="${id}"]`;
  const existente = document.querySelector(selector);

  if (!activo) {
    existente?.remove();
    return;
  }
  if (existente) return;

  const estilo = document.createElement('style');
  estilo.setAttribute(ATRIBUTO_ESTILO_MOD, id);
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);
}

let temporizadorAutoClic = null;

/** Pulsa el boton de posts nuevos si esta en pantalla. Devuelve true si lo pulso. */
function pulsarPostsNuevos() {
  // pillLabel es el texto de dentro ("Mostrar 35 posts"); lo que se puede pulsar
  // es su ancestro con role="button". Evitamos las clases generadas de X.
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

function configurarAutoClic(activo, intervaloMs) {
  if (temporizadorAutoClic) {
    clearTimeout(temporizadorAutoClic);
    temporizadorAutoClic = null;
  }

  if (!activo) return;
  const intervaloSeguro = Math.max(5000, Math.min(5 * 60 * 1000, Number(intervaloMs) || 45000));
  programarAutoClic(intervaloSeguro);
}

let observadorOrdenInicio = null;
let temporizadorOrdenInicio = null;
let ultimoCambioDePestana = 0;

function textoComparable(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pestanaSiguiendo() {
  const columna = document.querySelector('[data-testid="primaryColumn"]') || document;
  const lista = columna.querySelector('[role="tablist"]');
  if (!lista) return null;

  const pestanas = [...lista.querySelectorAll('[role="tab"]')].filter((elemento) => {
    const rect = elemento.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const nombres = ['siguiendo', 'following'];
  const porNombre = pestanas.find((pestana) =>
    nombres.some((nombre) => textoComparable(pestana.textContent).includes(nombre)),
  );

  // En Inicio X muestra primero "Para ti" y después "Siguiendo". El fallback
  // permite sobrevivir a otro idioma mientras mantenga ese par de pestañas.
  return porNombre || (pestanas.length === 2 ? pestanas[1] : null);
}

function intentarAbrirSiguiendo() {
  temporizadorOrdenInicio = null;
  if (location.pathname !== '/home') return;

  const pestana = pestanaSiguiendo();
  if (!pestana || pestana.getAttribute('aria-selected') === 'true') return;

  const ahora = Date.now();
  if (ahora - ultimoCambioDePestana < 1200) return;
  ultimoCambioDePestana = ahora;
  pestana.click();
}

function programarAbrirSiguiendo() {
  if (temporizadorOrdenInicio) return;
  temporizadorOrdenInicio = setTimeout(intentarAbrirSiguiendo, 80);
}

function configurarOrdenInicio(modo) {
  observadorOrdenInicio?.disconnect();
  observadorOrdenInicio = null;
  if (temporizadorOrdenInicio) clearTimeout(temporizadorOrdenInicio);
  temporizadorOrdenInicio = null;

  if (modo !== 'recientes') return;

  observadorOrdenInicio = new MutationObserver(programarAbrirSiguiendo);
  observadorOrdenInicio.observe(document.documentElement, { childList: true, subtree: true });
  programarAbrirSiguiendo();
}

// --- Organización visual del timeline ---
//
// Los separadores solo añaden una etiqueta superpuesta; no cambian alturas. El
// orden experimental intercambia las posiciones que X ya calculó para las
// celdas visibles, sin mover nodos administrados por React.

const ATRIBUTO_SEPARADOR = 'data-x-electron-separador';
const estilosOriginalesCeldas = new Map();
let modoSeparadoresTimeline = 'ninguno';
let modoOrdenVisible = 'original';
let observadorTimeline = null;
let temporizadorTimeline = null;

function celdasDelTimeline() {
  const vistas = [];
  const conocidas = new Set();

  for (const tweet of document.querySelectorAll('[data-testid="tweet"]')) {
    const celda = tweet.closest('[data-testid="cellInnerDiv"]');
    const tiempo = tweet.querySelector('time[datetime]');
    const fecha = Date.parse(tiempo?.getAttribute('datetime') ?? '');
    if (!celda || conocidas.has(celda) || !Number.isFinite(fecha)) continue;

    conocidas.add(celda);
    vistas.push({
      celda,
      fecha,
      conMedia: Boolean(
        tweet.querySelector(
          '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video, [aria-label*="Image"]',
        ),
      ),
    });
  }

  return vistas;
}

function etiquetaDia(ms) {
  const fecha = new Date(ms);
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const inicioFecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
  const dias = Math.round((inicioHoy - inicioFecha) / 86400000);

  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return fecha.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function aplicarSeparadores(vistas) {
  for (const celda of document.querySelectorAll(`[${ATRIBUTO_SEPARADOR}]`)) {
    celda.removeAttribute(ATRIBUTO_SEPARADOR);
  }
  if (modoSeparadoresTimeline === 'ninguno') return;

  const ordenVisual = [...vistas].sort(
    (a, b) => a.celda.getBoundingClientRect().top - b.celda.getBoundingClientRect().top,
  );
  let grupoAnterior = null;

  for (const vista of ordenVisual) {
    const fecha = new Date(vista.fecha);
    const grupo = modoSeparadoresTimeline === 'dia'
      ? `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`
      : vista.conMedia ? 'media' : 'texto';
    if (grupo === grupoAnterior) continue;

    vista.celda.setAttribute(
      ATRIBUTO_SEPARADOR,
      modoSeparadoresTimeline === 'dia'
        ? etiquetaDia(vista.fecha)
        : vista.conMedia ? 'Con multimedia' : 'Solo texto',
    );
    grupoAnterior = grupo;
  }
}

function restaurarOrdenVisible() {
  for (const [celda, estilos] of estilosOriginalesCeldas) {
    if (!celda.isConnected) continue;
    celda.style.transform = estilos.transform;
    celda.style.top = estilos.top;
  }
  estilosOriginalesCeldas.clear();
}

function aplicarOrdenVisible(vistas) {
  if (!['recientes', 'antiguos'].includes(modoOrdenVisible) || vistas.length < 2) return;

  for (const [celda] of estilosOriginalesCeldas) {
    if (!celda.isConnected) estilosOriginalesCeldas.delete(celda);
  }

  const posiciones = [...vistas]
    .sort((a, b) => a.celda.getBoundingClientRect().top - b.celda.getBoundingClientRect().top)
    .map(({ celda }) => ({
      transform: celda.style.transform,
      top: celda.style.top,
    }));

  // Si X cambia su virtualizador y deja de posicionar las celdas, no forzamos
  // otro modelo de layout: el modo experimental se limita a no hacer nada.
  if (!posiciones.some((posicion) => posicion.transform || posicion.top)) return;

  const porFecha = [...vistas].sort((a, b) =>
    modoOrdenVisible === 'antiguos' ? a.fecha - b.fecha : b.fecha - a.fecha,
  );

  porFecha.forEach(({ celda }, indice) => {
    if (!estilosOriginalesCeldas.has(celda)) {
      estilosOriginalesCeldas.set(celda, {
        transform: celda.style.transform,
        top: celda.style.top,
      });
    }
    celda.style.transform = posiciones[indice].transform;
    celda.style.top = posiciones[indice].top;
  });
}

function actualizarTimeline() {
  temporizadorTimeline = null;
  const vistas = celdasDelTimeline();
  aplicarOrdenVisible(vistas);
  aplicarSeparadores(vistas);
}

function programarActualizarTimeline() {
  if (temporizadorTimeline) return;
  temporizadorTimeline = setTimeout(actualizarTimeline, 100);
}

function reiniciarObservadorTimeline() {
  observadorTimeline?.disconnect();
  window.removeEventListener('scroll', programarActualizarTimeline, true);
  observadorTimeline = null;

  const activo =
    modoSeparadoresTimeline !== 'ninguno' ||
    ['recientes', 'antiguos'].includes(modoOrdenVisible);
  if (!activo) return;

  observadorTimeline = new MutationObserver(programarActualizarTimeline);
  observadorTimeline.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('scroll', programarActualizarTimeline, { capture: true, passive: true });
  programarActualizarTimeline();
}

function configurarSeparadoresTimeline(modo) {
  modoSeparadoresTimeline = ['dia', 'contenido'].includes(modo) ? modo : 'ninguno';
  configurarEstilos(
    'separadores-timeline',
    `
      [${ATRIBUTO_SEPARADOR}] {
        box-shadow: inset 0 2px 0 rgb(29 155 240 / 0.58) !important;
      }

      [${ATRIBUTO_SEPARADOR}]::before {
        content: attr(${ATRIBUTO_SEPARADOR});
        position: absolute;
        z-index: 8;
        top: 5px;
        right: 12px;
        padding: 3px 7px;
        border: 1px solid rgb(29 155 240 / 0.42);
        border-radius: 999px;
        background: rgb(15 20 25 / 0.88);
        color: rgb(142 205 248);
        font: 700 10px/1.2 ui-monospace, monospace;
        letter-spacing: 0.04em;
        pointer-events: none;
      }
    `,
    modoSeparadoresTimeline !== 'ninguno',
  );
  reiniciarObservadorTimeline();
}

function configurarOrdenVisible(modo) {
  const siguiente = ['recientes', 'antiguos'].includes(modo) ? modo : 'original';
  if (siguiente === 'original') restaurarOrdenVisible();
  modoOrdenVisible = siguiente;
  reiniciarObservadorTimeline();
}

// Registro central. Para agregar un mod nuevo basta con darle un id estable y una
// funcion configurar(valor, opciones). Los ids publicos viven en shared/x-mods.js.
const MODS_X = {
  interfazLimpia: {
    configurar(activo) {
      configurarEstilos(
        'interfaz-limpia',
        `
          [data-testid="sidebarColumn"] {
            display: none !important;
          }

          [data-testid="primaryColumn"] {
            width: 100% !important;
            max-width: 100% !important;
          }
        `,
        activo === true,
      );
    },
  },

  ocultarPremium: {
    configurar(activo) {
      configurarEstilos(
        'ocultar-premium',
        `
          [data-testid="super-upsell-UpsellCardRedesign"] {
            display: none !important;
          }
        `,
        activo === true,
      );
    },
  },

  ordenInicio: {
    configurar(modo) {
      configurarOrdenInicio(modo);
    },
  },

  separadoresTimeline: {
    configurar(modo) {
      configurarSeparadoresTimeline(modo);
    },
  },

  ordenVisibleExperimental: {
    configurar(modo) {
      configurarOrdenVisible(modo);
    },
  },

  autoMostrarPosts: {
    configurar(activo, opciones) {
      configurarAutoClic(activo === true, opciones.autoClicMs);
    },
  },
};

function aplicarConfiguracionMods(datos) {
  const mods = datos?.mods && typeof datos.mods === 'object' ? datos.mods : {};
  const opciones = { autoClicMs: datos?.autoClicMs };

  for (const [id, mod] of Object.entries(MODS_X)) mod.configurar(mods[id], opciones);
}

ipcRenderer.on(CANAL_CONFIGURAR_MODS, (_evento, datos) => aplicarConfiguracionMods(datos));
