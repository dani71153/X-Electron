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
  if (existente) {
    if (existente.textContent !== css) existente.textContent = css;
    return;
  }

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
// orden experimental calcula desplazamientos segun las alturas reales, sin
// sobrescribir las coordenadas de X ni mover nodos administrados por React.

const ATRIBUTO_SEPARADOR = 'data-x-electron-separador';
const estilosOriginalesCeldas = new Map();
let modoSeparadoresTimeline = 'ninguno';
let modoOrdenVisible = 'original';
let observadorTimeline = null;
let observadorTamanoTimeline = null;
let temporizadorTimeline = null;
let ocultarAnunciosActivo = false;
const ATRIBUTO_ANUNCIO = 'data-x-electron-anuncio';
const nodosAnuncios = new Set();

function aplicarFiltroAnuncios() {
  const siguientes = new Set();
  if (ocultarAnunciosActivo) {
    for (const tweet of document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweet"]')) {
      const indicador = tweet.closest('[data-testid="placementTracking"]')
        || tweet.querySelector('[data-testid="placementTracking"], [data-testid="promotedIndicator"]');
      const etiqueta = [...tweet.querySelectorAll('span')].some((span) => {
        if (span.children.length || span.closest('[data-testid="tweetText"], [data-testid="card.wrapper"], [data-testid="User-Name"], [role="link"]')) return false;
        return /^(anuncio|publicidad|promoted|ad)$/i.test(span.textContent.trim());
      });
      if (!indicador && !etiqueta) continue;
      const celda = tweet.closest('[data-testid="cellInnerDiv"]');
      if (!celda) continue;
      siguientes.add(celda);
      // Colapsar tambien envoltorios que reservan la altura del anuncio.
      let nodo = celda.parentElement;
      while (nodo && !nodo.matches('[data-testid="primaryColumn"]')
        && nodo.children.length === 1
        && nodo.querySelectorAll('[data-testid="cellInnerDiv"]').length === 1) {
        siguientes.add(nodo);
        nodo = nodo.parentElement;
      }
    }
  }
  for (const nodo of nodosAnuncios) {
    if (!siguientes.has(nodo)) nodo.removeAttribute(ATRIBUTO_ANUNCIO);
  }
  for (const nodo of siguientes) {
    if (!nodo.hasAttribute(ATRIBUTO_ANUNCIO)) nodo.setAttribute(ATRIBUTO_ANUNCIO, '');
  }
  nodosAnuncios.clear();
  for (const nodo of siguientes) nodosAnuncios.add(nodo);
}

function celdasDelTimeline() {
  const vistas = [];
  const conocidas = new Set();

  for (const tweet of document.querySelectorAll('[data-testid="primaryColumn"] [data-testid="tweet"]')) {
    const celda = tweet.closest('[data-testid="cellInnerDiv"]');
    const tiempo = tweet.querySelector('time[datetime]');
    const fecha = Date.parse(tiempo?.getAttribute('datetime') ?? '');
    if (!celda || celda.hasAttribute(ATRIBUTO_ANUNCIO) || conocidas.has(celda) || !Number.isFinite(fecha)) continue;

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
    // No restaurar coordenadas antiguas: X puede haber reciclado esta celda.
    if (celda.style.translate === estilos.aplicado) {
      if (estilos.translate) celda.style.setProperty('translate', estilos.translate, estilos.prioridad);
      else celda.style.removeProperty('translate');
    }
  }
  estilosOriginalesCeldas.clear();
}

function esDetalleDePost() {
  // Las respuestas forman hilos: no son un feed cronologico independiente.
  // X navega sin recargar, por eso se comprueba la ruta en cada actualizacion.
  return /\/(?:status|statuses)\/\d+(?:\/|$)/.test(location.pathname)
    || /\/i\/web\/status(?:\/|$)/.test(location.pathname);
}

function aplicarOrdenVisible(vistas) {
  restaurarOrdenVisible();
  if (esDetalleDePost()) return;
  if (!['recientes', 'antiguos'].includes(modoOrdenVisible) || vistas.length < 2) return;

  // Algunas versiones de X envuelven cada cellInnerDiv en su propio div.
  // Ordenar esos hermanos, no grupos de una sola celda que nunca se moverian.
  const unidades = vistas.map((vista) => {
    let celda = vista.celda;
    while (celda.parentElement && !celda.parentElement.matches('[data-testid="primaryColumn"]')) {
      const padre = celda.parentElement;
      const celdas = padre.querySelectorAll('[data-testid="cellInnerDiv"]');
      if (celdas.length !== 1 || celdas[0] !== vista.celda) break;
      celda = padre;
    }
    return { ...vista, celda, rect: celda.getBoundingClientRect() };
  });
  const medidas = new Map(unidades.map((vista) => [vista.celda, vista]));
  const padres = new Set(unidades.map(({ celda }) => celda.parentElement));
  const ordenarBloque = (bloque) => {
    if (bloque.length < 2) return;
    const original = [...bloque].sort((a, b) => a.rect.top - b.rect.top);
    // No atravesar anuncios, encabezados o huecos del virtualizador.
    // Si X aun esta midiendo sus celdas, esperar a su siguiente actualizacion.
    if (original.some((v, i) => v.rect.height <= 0
      || (i && v.rect.top < original[i - 1].rect.bottom - 0.5))) return;
    const huecos = original.map((v, i) => i < original.length - 1
      ? Math.max(0, original[i + 1].rect.top - v.rect.bottom) : 0);
    const ordenadas = [...original].sort((a, b) => modoOrdenVisible === 'antiguos'
      ? a.fecha - b.fecha : b.fecha - a.fecha);
    let destino = original[0].rect.top;
    for (const [indice, vista] of ordenadas.entries()) {
      const { celda, rect } = vista;
      const desplazamiento = destino - rect.top;
      if (Math.abs(desplazamiento) > 0.01) {
        const estilos = {
          translate: celda.style.getPropertyValue('translate'),
          prioridad: celda.style.getPropertyPriority('translate'),
        };
        const base = getComputedStyle(celda).translate;
        const componentes = base === 'none' ? ['0px', '0px'] : base.split(/\s+/);
        const [x, y = '0px', z] = componentes;
        celda.style.setProperty('translate',
          `${x} calc(${y} + ${desplazamiento}px)${z ? ` ${z}` : ''}`);
        estilos.aplicado = celda.style.translate;
        estilosOriginalesCeldas.set(celda, estilos);
      }
      // Cada post reserva su altura real, no la del post que ocupaba ese sitio.
      destino += rect.height + huecos[indice];
    }
  };
  for (const padre of padres) {
    if (!padre) continue;
    let bloque = [];
    for (const celda of padre.children) {
      if (medidas.has(celda)) bloque.push(medidas.get(celda));
      else { ordenarBloque(bloque); bloque = []; }
    }
    ordenarBloque(bloque);
  }
}

function actualizarTimeline() {
  temporizadorTimeline = null;
  aplicarFiltroAnuncios();
  if (esDetalleDePost()) {
    restaurarOrdenVisible();
    for (const celda of document.querySelectorAll(`[${ATRIBUTO_SEPARADOR}]`)) {
      celda.removeAttribute(ATRIBUTO_SEPARADOR);
    }
    observadorTamanoTimeline?.disconnect();
    celdasObservadasTimeline.clear();
    observadorTimeline?.takeRecords();
    return;
  }
  const vistas = celdasDelTimeline();
  aplicarOrdenVisible(vistas);
  aplicarSeparadores(vistas);
  // Descartar solo las mutaciones sincronas de nuestros estilos y etiquetas.
  observadorTimeline?.takeRecords();
  if (observadorTamanoTimeline) {
    const actuales = new Set(vistas.map(({ celda }) => celda));
    for (const celda of celdasObservadasTimeline) {
      if (!actuales.has(celda)) observadorTamanoTimeline.unobserve(celda);
    }
    for (const celda of actuales) {
      if (!celdasObservadasTimeline.has(celda)) observadorTamanoTimeline.observe(celda);
    }
    celdasObservadasTimeline = actuales;
  }
}

let celdasObservadasTimeline = new Set();

function programarActualizarTimeline() {
  if (temporizadorTimeline) return;
  temporizadorTimeline = setTimeout(actualizarTimeline, 100);
}

function reiniciarObservadorTimeline() {
  observadorTimeline?.disconnect();
  observadorTamanoTimeline?.disconnect();
  observadorTamanoTimeline = null;
  celdasObservadasTimeline.clear();
  if (temporizadorTimeline) clearTimeout(temporizadorTimeline);
  temporizadorTimeline = null;
  window.removeEventListener('scroll', programarActualizarTimeline, true);
  observadorTimeline = null;

  const activo =
    ocultarAnunciosActivo || modoSeparadoresTimeline !== 'ninguno' ||
    ['recientes', 'antiguos'].includes(modoOrdenVisible);
  if (!activo) return;

  observadorTimeline = new MutationObserver((cambios) => {
    if (cambios.some((cambio) => cambio.type === 'childList' || cambio.type === 'characterData'
      || cambio.target.closest?.('[data-testid="primaryColumn"]'))) programarActualizarTimeline();
  });
  observadorTimeline.observe(document.documentElement, {
    childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style', 'datetime'],
  });
  observadorTamanoTimeline = new ResizeObserver(programarActualizarTimeline);
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

// Panel propio fuera del arbol de React de X. Solo lee tendencias ya capturadas.
let detenerPanelTendencias = null;
let destinoTendencias = 'pagina';
let fuenteTendencias = 'columnas';

function configurarPanelTendencias(activo) {
  if (!activo) {
    detenerPanelTendencias?.();
    detenerPanelTendencias = null;
    return;
  }
  if (detenerPanelTendencias || !document.body) return;

  const host = document.createElement('aside');
  host.setAttribute('aria-label', 'Tendencias de X');
  host.setAttribute('data-x-electron-tendencias', '');
  host.style.cssText = 'position:fixed;display:none;top:16px;bottom:16px;z-index:0;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const estilo = document.createElement('style');
  estilo.textContent = `
    :host { font: 14px/1.4 system-ui, sans-serif; }
    * { box-sizing: border-box; }
    section { max-height:100%; overflow:auto; border:1px solid #8899a644;
      border-radius:16px; background:var(--panel-fondo,#fff); color:var(--panel-texto,#0f1419); }
    header { padding:16px; border-bottom:1px solid #8899a633; }
    h2 { margin:0 0 4px; font-size:20px; } p { margin:0; opacity:.65; font-size:12px; }
    ol { list-style:none; padding:0; margin:0; }
    a { display:block; padding:12px 16px; color:inherit; text-decoration:none; border-bottom:1px solid #8899a622; }
    a:hover, a:focus-visible { background:#8899a61a; }
    strong, small { display:block; overflow-wrap:anywhere; }
    small { opacity:.65; font-size:12px; margin-top:3px; }
    .estado { padding:16px; }
  `;
  const seccion = document.createElement('section');
  const cabecera = document.createElement('header');
  const titulo = document.createElement('h2');
  titulo.textContent = 'Tendencias';
  const fecha = document.createElement('p');
  fecha.textContent = 'Temas capturados por la app';
  const contador = document.createElement('p');
  contador.style.cssText = 'margin-top:6px;font-variant-numeric:tabular-nums;';
  const lista = document.createElement('ol');
  cabecera.append(titulo, fecha, contador);
  seccion.append(cabecera, lista);
  shadow.append(estilo, seccion);
  document.body.append(host);
  let cerrado = false;
  let frame = null;
  let leyendo = false;
  let captura = null;
  let siguienteConsulta = Date.now();
  let temporizadorConsulta = null;
  const cuenta = (instante) => {
    const segundos = Math.max(0, Math.ceil((instante - Date.now()) / 1000));
    return `${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
  };
  const pintarContador = () => {
    if (cerrado) return;
    const consulta = leyendo ? 'Consultando…' : `Actualizar panel en ${cuenta(siguienteConsulta)}`;
    contador.textContent = fuenteTendencias === 'explorar' && captura
      ? `${captura.enCurso ? 'Capturando de X…' : `Próxima captura en ${cuenta(captura.siguienteIntento)}`} · ${consulta}`
      : `${consulta} · La captura depende de las columnas`;
  };

  const visible = (elemento) => {
    const rect = elemento.getBoundingClientRect();
    const css = getComputedStyle(elemento);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < window.innerHeight && rect.left < window.innerWidth
      && css.display !== 'none' && css.visibility !== 'hidden' && css.opacity !== '0';
  };
  const hayVentanaAbierta = (izquierda, ancho) => {
    // Los visores de fotos y respuestas usan portales fuera del timeline.
    if ([...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
      .some(visible)) return true;

    // Grok y mensajes tambien pueden abrirse como paneles sin role="dialog".
    // Comprobar lo que ocupa este espacio sin que nuestro propio panel lo tape.
    const revisados = new Set();
    for (const x of [izquierda + 8, izquierda + ancho / 2, izquierda + ancho - 8]) {
      for (const y of [32, window.innerHeight / 2, window.innerHeight - 32]) {
        for (const elemento of document.elementsFromPoint(x, y)) {
          for (let nodo = elemento; nodo && nodo !== document.body; nodo = nodo.parentElement) {
            if (nodo === host || revisados.has(nodo)) continue;
            revisados.add(nodo);
            const css = getComputedStyle(nodo);
            if (css.position !== 'fixed' && css.position !== 'absolute') continue;
            // No confundir la estructura de la pagina con una ventana flotante.
            if (nodo.contains(document.querySelector('[data-testid="primaryColumn"]'))) continue;
            const rect = nodo.getBoundingClientRect();
            if (rect.width >= 240 && rect.height >= 180 && visible(nodo)) return true;
          }
        }
      }
    }
    return false;
  };
  const posicionar = () => {
    frame = null;
    const columna = document.querySelector('[data-testid="primaryColumn"]');
    const rect = columna?.getBoundingClientRect();
    const espacio = rect ? document.documentElement.clientWidth - rect.right - 32 : 0;
    host.style.display = 'none';
    if (espacio < 260 || !rect || rect.width <= 0
      || hayVentanaAbierta(rect.right + 16, Math.min(340, espacio))) return;
    host.style.display = 'block';
    host.style.left = `${rect.right + 16}px`;
    host.style.width = `${Math.min(340, espacio)}px`;
    host.style.setProperty('--panel-texto', getComputedStyle(columna).color);
    const fondo = [columna, document.body, document.documentElement]
      .map((el) => getComputedStyle(el).backgroundColor)
      .find((color) => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent');
    host.style.setProperty('--panel-fondo', fondo || '#fff');
  };
  const programar = () => {
    if (!cerrado && frame === null) frame = requestAnimationFrame(posicionar);
  };
  const estado = (mensaje) => {
    const item = document.createElement('li');
    item.className = 'estado';
    item.textContent = mensaje;
    lista.replaceChildren(item);
  };
  const actualizar = async () => {
    if (leyendo || cerrado) return;
    leyendo = true;
    pintarContador();
    try {
      const respuesta = await ipcRenderer.invoke('tendencias:listar', fuenteTendencias, true);
      if (cerrado) return;
      const tendencias = respuesta.tendencias;
      captura = respuesta.captura;
      if (!Array.isArray(tendencias) || tendencias.length === 0) {
        fecha.textContent = 'Esperando la primera captura';
        estado(fuenteTendencias === 'explorar'
          ? 'Esperando Explorar > Tendencias con tu sesion de X. La primera captura puede tardar un minuto.'
          : 'Todavia no hay tendencias. Apareceran cuando las columnas de datos las capturen de X.');
        return;
      }
      const ultima = Math.max(...tendencias.map((t) => Number(t.actualizadaEn) || 0));
      fecha.textContent = ultima > 0
        ? `${fuenteTendencias === 'explorar' ? 'Explorar > Tendencias' : 'Desde las columnas'} · ${new Date(ultima).toLocaleString()}` : 'Temas capturados por la app';
      const filas = tendencias.slice(0, 20).map((t, indice) => {
        const fila = document.createElement('li');
        const enlace = document.createElement('a');
        enlace.href = `https://x.com/search?q=${encodeURIComponent(t.consulta || t.nombre)}&src=trend_click`;
        enlace.addEventListener('click', async (evento) => {
          if (destinoTendencias !== 'modal' || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
          evento.preventDefault();
          try {
            await ipcRenderer.invoke('tendencias:abrirModal', String(t.consulta || t.nombre));
          } catch {
            fecha.textContent = 'No se pudo abrir la busqueda. Vuelve a intentarlo.';
          }
        });
        const nombre = document.createElement('strong');
        nombre.textContent = `${indice + 1}. ${t.nombre}`;
        const detalle = document.createElement('small');
        detalle.textContent = [t.contexto, t.posts > 0
          ? `${new Intl.NumberFormat('es', { notation: 'compact' }).format(t.posts)} posts`
          : t.descripcion].filter(Boolean).join(' · ');
        enlace.append(nombre, detalle);
        fila.append(enlace);
        return fila;
      });
      lista.replaceChildren(...filas);
    } catch {
      if (!cerrado) {
        fecha.textContent = 'No se pudo actualizar';
        if (!lista.children.length) estado('Las tendencias no estan disponibles en este momento.');
      }
    } finally {
      leyendo = false;
      if (!cerrado) {
        const espera = captura?.enCurso ? 3000 : captura?.siguienteIntento
          ? Math.max(1000, Math.min(60000, captura.siguienteIntento - Date.now())) : 60000;
        siguienteConsulta = Date.now() + espera;
        temporizadorConsulta = setTimeout(actualizar, espera);
        pintarContador();
      }
    }
  };
  const observador = new MutationObserver((cambios) => {
    if (cambios.some((cambio) => cambio.target !== host)) programar();
  });
  observador.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-modal', 'role'],
  });
  // Tambien detecta cambios de ancho causados por los controles de Mods.
  const tamano = new ResizeObserver(programar);
  tamano.observe(document.body);
  window.addEventListener('resize', programar);
  window.addEventListener('scroll', programar, true);
  window.addEventListener('transitionend', programar, true);
  window.addEventListener('animationend', programar, true);
  const intervalo = setInterval(pintarContador, 1000);
  detenerPanelTendencias = () => {
    cerrado = true;
    clearInterval(intervalo);
    clearTimeout(temporizadorConsulta);
    if (frame !== null) cancelAnimationFrame(frame);
    observador.disconnect();
    tamano.disconnect();
    window.removeEventListener('resize', programar);
    window.removeEventListener('scroll', programar, true);
    window.removeEventListener('transitionend', programar, true);
    window.removeEventListener('animationend', programar, true);
    host.remove();
  };
  posicionar();
  actualizar();
}

// Registro central. Para agregar un mod nuevo basta con darle un id estable y una
// funcion configurar(valor, opciones). Los ids publicos viven en shared/x-mods.js.
const MODS_X = {
  ocultarAnuncios: {
    configurar(activo) {
      ocultarAnunciosActivo = activo === true;
      configurarEstilos('ocultar-anuncios', `
        [${ATRIBUTO_ANUNCIO}] {
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          margin-block: 0 !important;
          padding-block: 0 !important;
          border-block-width: 0 !important;
          overflow: hidden !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `, ocultarAnunciosActivo);
      aplicarFiltroAnuncios();
      reiniciarObservadorTimeline();
    },
  },
  interfazLimpia: {
    configurar(activo, opciones) {
      const margen = typeof opciones.margenIzquierdo === 'number' && Number.isFinite(opciones.margenIzquierdo)
        ? Math.max(0, Math.min(10000, Math.round(opciones.margenIzquierdo)))
        : 12;
      const ancho = typeof opciones.anchoPosts === 'number' && Number.isFinite(opciones.anchoPosts)
        ? Math.max(320, Math.min(10000, Math.round(opciones.anchoPosts)))
        : 600;
      const proporcionIzquierda = opciones.direccionAnchoPosts === 'izquierda' ? 1
        : opciones.direccionAnchoPosts === 'simetrico' ? 0.5 : 0;
      // El menu acompana el desplazamiento: nunca queda debajo de los posts.
      const margenAjustado = Math.max(0, margen - (ancho - 600) * proporcionIzquierda);
      configurarEstilos(
        'interfaz-limpia',
        `
          [data-testid="sidebarColumn"] {
            display: none !important;
          }

          /* Mantener el menu cerca del borde, sin un margen lateral flexible. */
          div:has(> header[role="banner"]):has(> main[role="main"]) {
            justify-content: flex-start !important;
            padding-inline-start: ${margenAjustado}px !important;
            box-sizing: border-box !important;
          }

          header[role="banner"]:has(~ main [data-testid="primaryColumn"]) {
            flex: 0 0 auto !important;
            align-items: flex-start !important;
          }

          main[role="main"]:has([data-testid="primaryColumn"]) {
            flex: 0 1 ${ancho}px !important;
            min-width: 0 !important;
            align-items: stretch !important;
          }

          main[role="main"] > div:has([data-testid="primaryColumn"]) {
            width: 100% !important;
            max-width: ${ancho}px !important;
          }

          [data-testid="primaryColumn"] {
            width: 100% !important;
            max-width: ${ancho}px !important;
            min-width: 0 !important;
          }

          /* X tambien limita el ancho de los posts dentro de cada celda. */
          [data-testid="primaryColumn"] [data-testid="cellInnerDiv"] div:has(article[data-testid="tweet"]),
          [data-testid="primaryColumn"] article[data-testid="tweet"] {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
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
  destinoTendencias = mods.abrirTendencias === 'modal' ? 'modal' : 'pagina';
  const nuevaFuente = mods.fuenteTendencias === 'explorar' ? 'explorar' : 'columnas';
  if (nuevaFuente !== fuenteTendencias) {
    configurarPanelTendencias(false);
    fuenteTendencias = nuevaFuente;
  }
  const opciones = {
    autoClicMs: datos?.autoClicMs,
    margenIzquierdo: mods.margenIzquierdo,
    anchoPosts: mods.anchoPosts,
    direccionAnchoPosts: mods.direccionAnchoPosts,
  };

  for (const [id, mod] of Object.entries(MODS_X)) mod.configurar(mods[id], opciones);
  configurarPanelTendencias(mods.interfazLimpia === true && mods.panelTendencias === true);
}

ipcRenderer.on(CANAL_CONFIGURAR_MODS, (_evento, datos) => aplicarConfiguracionMods(datos));
