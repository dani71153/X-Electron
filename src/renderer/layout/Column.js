// Una columna. Puede ser de dos tipos:
//
// - De datos: lista de tweets pintada desde nuestra base de datos, con un visor
//   en la cabecera que dice cuándo se actualizó por última vez.
// - En vivo (webview): embebe x.com de verdad, en directo. No se cosecha.

import { crearTweet } from '../components/Tweet.js';

const ETIQUETA_TIPO = {
  home: 'Inicio',
  notifications: 'Notificaciones',
  list: 'Lista',
  user: 'Perfil',
  search: 'Búsqueda',
  saved: 'Guardados',
};

/** 1720000000000 -> "hace 2 min" */
function hace(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

export class Columna {
  constructor(columna, alBorrar, acciones = {}) {
    this.columna = columna;
    this.alBorrar = alBorrar;
    this.acciones = acciones; // callbacks compartidos: alCambiarGuardado, alAbrir
    this.vivo = columna.vivo === true;
    this.esGuardados = columna.tipo === 'saved';
    this.estadoUi = {
      colapsada: acciones.estadoUi?.colapsada === true,
      expandida: this.vivo && acciones.estadoUi?.expandida === true,
      ancho: Number(acciones.estadoUi?.ancho) || Number(acciones.anchoPredeterminado) || 380,
      leidoHasta: Number(acciones.estadoUi?.leidoHasta) || 0,
    };
    this.filtrosLocales = acciones.filtrosLocales ?? {};
    this.noLeidos = 0;
    this.ocultosPorFiltro = 0;
    this.tweetsActuales = [];
    this.cosechaPausada = false;

    // Estado de cosecha, solo para columnas de datos.
    this.fase = 'esperando'; // 'esperando' | 'cosechando' | 'ok'
    this.actualizadaEn = 0;
    this.tickVisor = null;

    this.elemento = this.crearElemento();
    this.aplicarEstadoUi();
  }

  crearElemento() {
    const seccion = document.createElement('section');
    seccion.className = this.vivo ? 'columna columna--vivo' : 'columna';
    seccion.setAttribute('aria-labelledby', `titulo-columna-${this.columna.id}`);
    seccion.tabIndex = -1;
    seccion.addEventListener('pointerdown', () => {
      if (this.acciones.alActivarColumna) this.acciones.alActivarColumna(this.columna.id);
    });

    seccion.appendChild(this.crearCabecera());

    if (this.vivo) {
      // La webview va dentro de un contenedor que ocupa el alto restante.
      // Ojo: Electron solo reajusta el contenido de X cuando la webview tiene un
      // alto en PÍXELES; con flex o % se queda clavado en 150px. Por eso medimos
      // el contenedor y le fijamos el tamaño a mano (ver observarTamano).
      this.contenedor = document.createElement('div');
      this.contenedor.className = 'columna-webview-wrap';
      this.contenedor.appendChild(this.crearWebview());
      seccion.appendChild(this.contenedor);
    } else {
      this.lista = document.createElement('div');
      this.lista.className = 'columna-lista';
      this.lista.addEventListener('scroll', () => {
        if (this.lista.scrollTop < 50 && this.noLeidos > 0) this.marcarLeido();
      }, { passive: true });
      seccion.appendChild(this.lista);
    }

    return seccion;
  }

  crearCabecera() {
    const cabecera = document.createElement('header');
    cabecera.className = 'columna-cabecera';

    const fila = document.createElement('div');
    fila.className = 'columna-cabecera-fila';

    // Asa de arrastre. Es solo la pista visual: en realidad se puede arrastrar
    // desde toda la cabecera (ver arrastre.js), que es un blanco mas facil.
    const asa = document.createElement('span');
    asa.className = 'columna-asa';
    asa.textContent = '⠿';
    asa.title = 'Arrastra para mover la columna';
    asa.setAttribute('aria-hidden', 'true');
    fila.appendChild(asa);

    const titulo = document.createElement('h2');
    titulo.id = `titulo-columna-${this.columna.id}`;
    titulo.textContent = this.columna.titulo;
    fila.appendChild(titulo);

    const tipo = document.createElement('span');
    tipo.className = 'columna-tipo';
    tipo.textContent = ETIQUETA_TIPO[this.columna.tipo] ?? this.columna.tipo;
    fila.appendChild(tipo);

    if (this.vivo) {
      // Fijar como principal: los tweets que abras desde otras columnas se
      // cargan en la webview de la columna principal.
      this.botonPrincipal = document.createElement('button');
      this.botonPrincipal.type = 'button';
      this.botonPrincipal.className = 'columna-icono columna-pin';
      this.botonPrincipal.textContent = '⌖';
      this.botonPrincipal.title = 'Fijar como columna principal';
      this.botonPrincipal.setAttribute('aria-label', 'Fijar como columna principal');
      this.botonPrincipal.setAttribute('aria-pressed', 'false');
      this.botonPrincipal.addEventListener('click', () => {
        if (this.acciones.alFijarPrincipal) this.acciones.alFijarPrincipal(this.columna.id);
      });
      fila.appendChild(this.botonPrincipal);

      const recargar = document.createElement('button');
      recargar.type = 'button';
      recargar.className = 'columna-icono';
      recargar.textContent = '↻';
      recargar.title = 'Recargar';
      recargar.setAttribute('aria-label', 'Recargar columna');
      recargar.addEventListener('click', () => this.webview?.reload());
      fila.appendChild(recargar);

      this.botonExpandir = document.createElement('button');
      this.botonExpandir.type = 'button';
      this.botonExpandir.className = 'columna-icono columna-expandir';
      this.botonExpandir.textContent = '⛶';
      this.botonExpandir.title = 'Usar el espacio disponible';
      this.botonExpandir.setAttribute('aria-label', 'Usar el espacio disponible');
      this.botonExpandir.setAttribute('aria-pressed', 'false');
      this.botonExpandir.addEventListener('click', () => this.alternarExpandida());
      fila.appendChild(this.botonExpandir);

      // Aparece cuando navegas a una búsqueda dentro de la webview.
      this.botonBusqueda = document.createElement('button');
      this.botonBusqueda.type = 'button';
      this.botonBusqueda.className = 'columna-icono columna-anadir-busqueda';
      this.botonBusqueda.textContent = '+';
      this.botonBusqueda.title = 'Añadir esta búsqueda como columna';
      this.botonBusqueda.setAttribute('aria-label', 'Añadir esta búsqueda como columna');
      this.botonBusqueda.hidden = true;
      this.botonBusqueda.addEventListener('click', () => {
        if (this.busquedaDetectada && this.acciones.alAnadirBusqueda) {
          this.acciones.alAnadirBusqueda(this.busquedaDetectada);
        }
      });
      fila.appendChild(this.botonBusqueda);
    }

    this.botonAncho = document.createElement('button');
    this.botonAncho.type = 'button';
    this.botonAncho.className = 'columna-icono columna-ancho';
    this.botonAncho.textContent = '↔';
    this.botonAncho.title = 'Cambiar ancho de columna';
    this.botonAncho.setAttribute('aria-label', 'Cambiar ancho de columna');
    this.botonAncho.addEventListener('click', () => this.ciclarAncho());
    fila.appendChild(this.botonAncho);

    this.botonColapsar = document.createElement('button');
    this.botonColapsar.type = 'button';
    this.botonColapsar.className = 'columna-icono columna-colapsar';
    this.botonColapsar.textContent = '−';
    this.botonColapsar.title = 'Contraer columna';
    this.botonColapsar.setAttribute('aria-label', `Contraer columna ${this.columna.titulo}`);
    this.botonColapsar.addEventListener('click', () => this.alternarColapsada());
    fila.appendChild(this.botonColapsar);

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'columna-icono';
    borrar.textContent = '×';
    borrar.title = 'Quitar columna';
    borrar.setAttribute('aria-label', `Quitar columna ${this.columna.titulo}`);
    borrar.addEventListener('click', () => this.alBorrar(this.columna.id));
    fila.appendChild(borrar);

    cabecera.appendChild(fila);

    // La segunda línea es el visor: "en vivo" o "actualizada hace X".
    this.visor = document.createElement('div');
    this.visor.className = 'columna-visor';
    cabecera.appendChild(this.visor);
    this.pintarVisor();

    // El tablero la usa como asa de arrastre para reordenar.
    this.cabecera = cabecera;

    return cabecera;
  }

  guardarEstadoUi() {
    if (this.acciones.alCambiarEstadoUi) {
      this.acciones.alCambiarEstadoUi(this.columna.id, { ...this.estadoUi });
    }
  }

  aplicarEstadoUi() {
    if (!this.elemento) return;
    const colapsada = this.estadoUi.colapsada === true;
    const expandida = this.vivo && this.estadoUi.expandida === true && !colapsada;
    this.elemento.classList.toggle('columna--colapsada', colapsada);
    this.elemento.classList.toggle('columna--expandida', expandida);
    this.elemento.style.setProperty('--ancho-columna-actual', `${this.estadoUi.ancho}px`);
    this.elemento.title = colapsada ? this.columna.titulo : '';
    if (this.botonExpandir) {
      this.botonExpandir.classList.toggle('activa', expandida);
      this.botonExpandir.setAttribute('aria-pressed', String(expandida));
      this.botonExpandir.title = expandida
        ? 'Restaurar el ancho de la WebView'
        : 'Usar el espacio disponible';
      this.botonExpandir.setAttribute(
        'aria-label',
        expandida ? 'Restaurar el ancho de la WebView' : 'Usar el espacio disponible',
      );
    }
    if (this.botonColapsar) {
      this.botonColapsar.textContent = colapsada ? '+' : '−';
      this.botonColapsar.title = colapsada ? 'Expandir columna' : 'Contraer columna';
      this.botonColapsar.setAttribute(
        'aria-label',
        `${colapsada ? 'Expandir' : 'Contraer'} columna ${this.columna.titulo}`,
      );
    }
  }

  alternarColapsada() {
    this.estadoUi.colapsada = !this.estadoUi.colapsada;
    if (this.estadoUi.colapsada) this.estadoUi.expandida = false;
    this.aplicarEstadoUi();
    this.guardarEstadoUi();
  }

  alternarExpandida() {
    if (!this.vivo) return;
    const expandida = !this.estadoUi.expandida;
    if (this.acciones.alExpandirWebview) {
      this.acciones.alExpandirWebview(this.columna.id, expandida);
      return;
    }
    this.estadoUi.expandida = expandida;
    if (expandida) this.estadoUi.colapsada = false;
    this.aplicarEstadoUi();
    this.guardarEstadoUi();
  }

  ciclarAncho() {
    const anchos = [320, 380, 460, 540];
    const actual = anchos.findIndex((ancho) => ancho >= this.estadoUi.ancho);
    this.estadoUi.ancho = anchos[(actual + 1 + anchos.length) % anchos.length];
    this.aplicarEstadoUi();
    this.guardarEstadoUi();
  }

  setFiltrosLocales(filtros) {
    this.filtrosLocales = filtros ?? {};
    if (!this.vivo) this.refrescar().catch((error) => console.error('[ui] filtro local:', error));
  }

  setCosechaPausada(pausada) {
    this.cosechaPausada = pausada === true;
    this.pintarVisor();
  }

  crearWebview() {
    const webview = document.createElement('webview');
    webview.className = 'columna-webview';
    // Los atributos deben estar puestos antes de añadirlo al DOM.
    webview.setAttribute('src', this.columna.url);
    webview.setAttribute('partition', window.config.particion);
    webview.setAttribute('preload', window.config.preloadX);
    webview.setAttribute('allowpopups', 'true');

    this.webview = webview;
    this.observarTamano();

    // Detecta cuando navegas a una búsqueda para ofrecer añadirla como columna.
    const alNavegar = (e) => this.detectarBusqueda(e.url);
    webview.addEventListener('did-navigate', alNavegar);
    webview.addEventListener('did-navigate-in-page', alNavegar);

    // Cada navegación carga el preload de cero y se pierde su temporizador, así
    // que hay que volver a decirle el ajuste. 'dom-ready' salta en cada carga.
    webview.addEventListener('dom-ready', () => this.enviarAutoMostrarPosts());

    return webview;
  }

  /**
   * Enciende o apaga dentro de X el auto-clic en "Mostrar N posts".
   * Solo tiene sentido en columnas en vivo: las de datos no tienen webview.
   *
   * @param {boolean} [activo] Si se omite, reenvía el último valor conocido.
   */
  enviarAutoMostrarPosts(activo) {
    if (activo !== undefined) this.autoMostrarPosts = activo;
    if (!this.vivo || !this.webview) return;

    // Si la webview aún no ha cargado, send() peta. El 'dom-ready' de arriba se
    // encargará de reenviarlo en cuanto esté lista.
    try {
      this.webview.send(window.config.canalAutoMostrar, {
        activo: this.autoMostrarPosts === true,
        intervaloMs: window.config.autoClicMs,
      });
    } catch {
      /* la webview todavía no está lista */
    }
  }

  /** Si la URL es una búsqueda de X, guarda los datos y muestra el botón de añadir. */
  detectarBusqueda(url) {
    if (!this.botonBusqueda) return;

    let query = null;
    let orden = 'live';
    try {
      const u = new URL(url);
      if (/\/search$/.test(u.pathname)) {
        query = u.searchParams.get('q');
        orden = u.searchParams.get('f') || 'top';
      }
    } catch {
      /* url rara: no es búsqueda */
    }

    if (query) {
      this.busquedaDetectada = {
        query,
        orden,
        titulo: query.length > 24 ? query.slice(0, 24) + '…' : query,
      };
      this.botonBusqueda.hidden = false;
      this.botonBusqueda.title = `Añadir "${query}" como columna`;
    } else {
      this.busquedaDetectada = null;
      this.botonBusqueda.hidden = true;
    }
  }

  /**
   * Fija el tamaño de la webview en píxeles según su contenedor.
   * Es necesario porque Electron no redimensiona el contenido de X cuando la
   * webview se dimensiona con flex o porcentajes: hay que darle píxeles.
   */
  observarTamano() {
    const aplicar = () => {
      if (!this.contenedor) return;
      const ancho = this.contenedor.clientWidth;
      const alto = this.contenedor.clientHeight;
      if (ancho > 0 && alto > 0) {
        // Los ATRIBUTOS width/height (no el CSS) son los que Electron usa para
        // dimensionar el contenido de X. Sin esto, el alto se queda en 150.
        this.webview.setAttribute('width', ancho);
        this.webview.setAttribute('height', alto);
        this.webview.style.width = `${ancho}px`;
        this.webview.style.height = `${alto}px`;
      }
    };

    this.observador = new ResizeObserver(aplicar);
    // Observamos el contenedor: cambia cuando la ventana o el tablero se ajustan.
    // Se conecta cuando el contenedor ya esta en el DOM (en el siguiente frame).
    requestAnimationFrame(() => {
      if (this.contenedor) {
        this.observador.observe(this.contenedor);
        aplicar();
      }
    });
  }

  /** Carga una URL de X en la webview (para abrir un tweet). Solo en columnas en vivo. */
  navegar(url) {
    if (!this.vivo || !this.webview) return;
    this.webview.loadURL(url).catch(() => {
      // loadURL puede no existir hasta que la webview este lista; probamos con src.
      this.webview.setAttribute('src', url);
    });
  }

  /** Marca visualmente esta columna como la principal (o no). */
  marcarPrincipal(esPrincipal) {
    this.elemento.classList.toggle('columna--principal', esPrincipal);
    if (this.botonPrincipal) {
      this.botonPrincipal.classList.toggle('activa', esPrincipal);
      this.botonPrincipal.setAttribute('aria-pressed', String(esPrincipal));
      this.botonPrincipal.title = esPrincipal
        ? 'Es la columna principal'
        : 'Fijar como columna principal';
    }
  }

  // --- Visor de estado ---

  /** Dibuja la línea de estado según el modo y la fase. */
  pintarVisor() {
    if (!this.visor) return;

    if (this.vivo) {
      this.visor.innerHTML = '';
      const punto = document.createElement('span');
      punto.className = 'punto punto--vivo';
      this.visor.appendChild(punto);
      this.visor.append(' En vivo');
      this.completarVisor();
      return;
    }

    // Guardados no se cosecha: sale de la base local, no tiene "última actualización".
    if (this.esGuardados) {
      this.visor.innerHTML = '';
      const punto = document.createElement('span');
      punto.className = 'punto punto--ok';
      this.visor.appendChild(punto);
      this.visor.append(' Guardados localmente');
      this.completarVisor();
      return;
    }

    let clasePunto = 'punto--espera';
    let texto;

    if (this.cosechaPausada) {
      clasePunto = 'punto--espera';
      texto = 'Cosecha pausada';
    } else if (this.fase === 'cosechando') {
      clasePunto = 'punto--cosechando';
      texto = 'Actualizando…';
    } else if (this.actualizadaEn > 0) {
      clasePunto = 'punto--ok';
      texto = `Actualizada ${hace(this.actualizadaEn)}`;
    } else {
      texto = `Sin actualizar aún, cada ~${window.config.cicloMinutos} min`;
    }

    this.visor.innerHTML = '';
    const punto = document.createElement('span');
    punto.className = `punto ${clasePunto}`;
    this.visor.appendChild(punto);
    this.visor.append(' ' + texto);
    this.completarVisor();
  }

  completarVisor() {
    if (this.noLeidos > 0 && !this.vivo) {
      const nuevos = document.createElement('button');
      nuevos.type = 'button';
      nuevos.className = 'columna-nuevos';
      nuevos.textContent = `${this.noLeidos} nuevos`;
      nuevos.title = 'Ir al inicio y marcar como leídos';
      nuevos.addEventListener('click', () => {
        this.lista.scrollTo({ top: 0, behavior: 'smooth' });
        this.marcarLeido();
      });
      this.visor.appendChild(nuevos);
    }
    if (this.ocultosPorFiltro > 0) {
      const ocultos = document.createElement('span');
      ocultos.className = 'columna-filtrados';
      ocultos.textContent = `${this.ocultosPorFiltro} ocultos`;
      this.visor.appendChild(ocultos);
    }
  }

  /** Recibe un cambio de estado desde main. */
  setEstado({ fase, actualizadaEn }) {
    if (this.vivo) return;

    this.fase = fase;
    if (actualizadaEn) this.actualizadaEn = actualizadaEn;
    this.pintarVisor();

    // Mientras haya una hora de actualización, refrescamos el "hace X" cada 15s.
    if (this.actualizadaEn > 0 && !this.tickVisor) {
      this.tickVisor = setInterval(() => this.pintarVisor(), 15000);
    }
  }

  // --- Contenido (solo columnas de datos) ---

  /** Vuelve a pedir los tweets a main y repinta la lista. */
  async refrescar() {
    if (this.vivo) return; // las webviews se refrescan solas

    // La columna de guardados sale de otra consulta; el resto, de su columna.
    const recibidos = this.esGuardados
      ? await window.api.tweetsGuardados()
      : await window.api.tweetsDeColumna(this.columna.id);

    if (this.estadoUi.leidoHasta === 0 && recibidos.length > 0) {
      this.estadoUi.leidoHasta = recibidos[0].creadoEn;
      this.guardarEstadoUi();
    }

    this.tweetsActuales = recibidos;
    const tweets = recibidos.filter((tweet) => this.pasaFiltros(tweet));
    this.ocultosPorFiltro = recibidos.length - tweets.length;
    this.noLeidos = tweets.filter((tweet) => tweet.creadoEn > this.estadoUi.leidoHasta).length;

    // Si el usuario esta leyendo abajo, no le movemos el scroll de golpe.
    const estabaArriba = this.lista.scrollTop < 50;
    if (estabaArriba && this.noLeidos > 0) this.marcarLeido(false);

    this.lista.replaceChildren();

    if (tweets.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'columna-vacia';
      vacio.textContent = recibidos.length > 0
        ? 'Todos los posts de esta columna están ocultos por los filtros locales.'
        : this.esGuardados
          ? 'No has guardado ningún tweet aún. Pulsa la estrella de un tweet.'
          : 'Todavía no hay tweets. El cosechador los traerá en unos segundos.';
      this.lista.appendChild(vacio);
      this.pintarVisor();
      return;
    }

    for (const [indice, tweet] of tweets.entries()) {
      this.lista.appendChild(crearTweet(tweet, this.acciones));
      if (this.noLeidos > 0 && indice + 1 === this.noLeidos) {
        const marca = document.createElement('div');
        marca.className = 'marcador-lectura';
        marca.textContent = 'Hasta aquí habías leído';
        this.lista.appendChild(marca);
      }
    }

    if (estabaArriba) this.lista.scrollTop = 0;
    this.pintarVisor();
  }

  pasaFiltros(tweet) {
    const filtros = this.filtrosLocales ?? {};
    const texto = String(tweet.texto ?? '').toLocaleLowerCase('es');
    const handle = String(tweet.autor?.handle ?? '').toLocaleLowerCase('es');
    const palabras = filtros.palabras ?? [];
    const usuarios = filtros.usuarios ?? [];

    if (palabras.some((palabra) => texto.includes(String(palabra).toLocaleLowerCase('es')))) return false;
    if (usuarios.some((usuario) => handle === String(usuario).replace(/^@/, '').toLocaleLowerCase('es'))) return false;
    if (filtros.ocultarRetweets && /^rt\s+@/i.test(tweet.texto ?? '')) return false;
    if (filtros.ocultarMedia && (tweet.media?.length ?? 0) > 0) return false;
    return true;
  }

  marcarLeido(repintar = true) {
    const masReciente = this.tweetsActuales[0]?.creadoEn ?? 0;
    if (masReciente > this.estadoUi.leidoHasta) {
      this.estadoUi.leidoHasta = masReciente;
      this.guardarEstadoUi();
    }
    this.noLeidos = 0;
    if (repintar) this.refrescar().catch((error) => console.error('[ui] marcar leído:', error));
    else this.pintarVisor();
  }

  destruir() {
    if (this.tickVisor) clearInterval(this.tickVisor);
    if (this.observador) this.observador.disconnect();
    this.elemento.remove();
  }
}
