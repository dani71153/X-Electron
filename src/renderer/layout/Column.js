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

    // Estado de cosecha, solo para columnas de datos.
    this.fase = 'esperando'; // 'esperando' | 'cosechando' | 'ok'
    this.actualizadaEn = 0;
    this.tickVisor = null;

    this.elemento = this.crearElemento();
  }

  crearElemento() {
    const seccion = document.createElement('section');
    seccion.className = this.vivo ? 'columna columna--vivo' : 'columna';

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
      seccion.appendChild(this.lista);
    }

    return seccion;
  }

  crearCabecera() {
    const cabecera = document.createElement('header');
    cabecera.className = 'columna-cabecera';

    const fila = document.createElement('div');
    fila.className = 'columna-cabecera-fila';

    const titulo = document.createElement('h2');
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
      this.botonPrincipal.className = 'columna-icono columna-pin';
      this.botonPrincipal.textContent = '📌';
      this.botonPrincipal.title = 'Fijar como columna principal';
      this.botonPrincipal.addEventListener('click', () => {
        if (this.acciones.alFijarPrincipal) this.acciones.alFijarPrincipal(this.columna.id);
      });
      fila.appendChild(this.botonPrincipal);

      const recargar = document.createElement('button');
      recargar.className = 'columna-icono';
      recargar.textContent = '⟳';
      recargar.title = 'Recargar';
      recargar.addEventListener('click', () => this.webview?.reload());
      fila.appendChild(recargar);

      // Aparece cuando navegas a una búsqueda dentro de la webview.
      this.botonBusqueda = document.createElement('button');
      this.botonBusqueda.className = 'columna-icono columna-anadir-busqueda';
      this.botonBusqueda.textContent = '＋🔍';
      this.botonBusqueda.title = 'Añadir esta búsqueda como columna';
      this.botonBusqueda.hidden = true;
      this.botonBusqueda.addEventListener('click', () => {
        if (this.busquedaDetectada && this.acciones.alAnadirBusqueda) {
          this.acciones.alAnadirBusqueda(this.busquedaDetectada);
        }
      });
      fila.appendChild(this.botonBusqueda);
    }

    const borrar = document.createElement('button');
    borrar.className = 'columna-icono';
    borrar.textContent = '✕';
    borrar.title = 'Quitar columna';
    borrar.addEventListener('click', () => this.alBorrar(this.columna.id));
    fila.appendChild(borrar);

    cabecera.appendChild(fila);

    // La segunda línea es el visor: "en vivo" o "actualizada hace X".
    this.visor = document.createElement('div');
    this.visor.className = 'columna-visor';
    cabecera.appendChild(this.visor);
    this.pintarVisor();

    return cabecera;
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

    return webview;
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
      return;
    }

    // Guardados no se cosecha: sale de la base local, no tiene "última actualización".
    if (this.esGuardados) {
      this.visor.innerHTML = '';
      const punto = document.createElement('span');
      punto.className = 'punto punto--ok';
      this.visor.appendChild(punto);
      this.visor.append(' Guardados localmente');
      return;
    }

    let clasePunto = 'punto--espera';
    let texto;

    if (this.fase === 'cosechando') {
      clasePunto = 'punto--cosechando';
      texto = 'Actualizando…';
    } else if (this.actualizadaEn > 0) {
      clasePunto = 'punto--ok';
      texto = `Actualizada ${hace(this.actualizadaEn)}`;
    } else {
      texto = `Sin actualizar aún · cada ~${window.config.cicloMinutos} min`;
    }

    this.visor.innerHTML = '';
    const punto = document.createElement('span');
    punto.className = `punto ${clasePunto}`;
    this.visor.appendChild(punto);
    this.visor.append(' ' + texto);
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
    const tweets = this.esGuardados
      ? await window.api.tweetsGuardados()
      : await window.api.tweetsDeColumna(this.columna.id);

    // Si el usuario esta leyendo abajo, no le movemos el scroll de golpe.
    const estabaArriba = this.lista.scrollTop < 50;

    this.lista.replaceChildren();

    if (tweets.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'columna-vacia';
      vacio.textContent = this.esGuardados
        ? 'No has guardado ningún tweet aún. Pulsa la estrella de un tweet.'
        : 'Todavía no hay tweets. El cosechador los traerá en unos segundos.';
      this.lista.appendChild(vacio);
      return;
    }

    for (const tweet of tweets) {
      this.lista.appendChild(crearTweet(tweet, this.acciones));
    }

    if (estabaArriba) this.lista.scrollTop = 0;
  }

  destruir() {
    if (this.tickVisor) clearInterval(this.tickVisor);
    if (this.observador) this.observador.disconnect();
    this.elemento.remove();
  }
}
