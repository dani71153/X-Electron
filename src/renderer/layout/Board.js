// El tablero: contiene las columnas y las mantiene sincronizadas con main.

import { Columna } from './Column.js';
import { ArrastreDeColumnas } from './arrastre.js';

export class Tablero {
  /**
   * @param {HTMLElement} contenedor
   * @param {() => Promise<void>} [recargar] Vuelve a leer las columnas de main
   */
  constructor(contenedor, recargar = null, ui = {}) {
    this.contenedor = contenedor;
    this.recargar = recargar;
    this.ui = ui;
    this.estadoTablero = contenedor.querySelector('#estado-tablero');
    this.estadoTitulo = contenedor.querySelector('#estado-titulo');
    this.estadoTexto = contenedor.querySelector('#estado-texto');
    this.botonEstadoAnadir = contenedor.querySelector('#btn-estado-anadir');
    this.botonEstadoReintentar = contenedor.querySelector('#btn-estado-reintentar');
    // columnaId -> instancia de Columna
    this.columnas = new Map();

    // Ids en el orden en que se ven, de izquierda a derecha. Es la fuente de
    // verdad del orden: el DOM NO se reordena nunca (ver arrastre.js).
    this.orden = [];

    // Id de la columna en vivo "principal": donde se abren los tweets.
    this.principalId = null;
    this.activaId = null;
    this.estadoColumnas = {};
    this.filtrosLocales = {};
    this.anchoPredeterminado = 380;
    this.espacioActivo = null;
    this.cosechaPausada = false;
    this.borradoPendiente = null;
    this.inicializado = false;

    this.arrastre = new ArrastreDeColumnas(contenedor, {
      obtenerOrden: () => this.idsVisibles(),
      elementoDe: (id) => this.columnas.get(id).elemento,
      // Mientras arrastras: repinta el orden, pero no toca la base de datos.
      alReordenar: (ids) => this.aplicarOrdenVisible(ids),
      // Al soltar: ya es definitivo, lo guardamos.
      alSoltar: (ids) => this.guardarOrdenVisible(ids),
    });

    // Acciones que comparten todos los tweets de todas las columnas.
    this.acciones = {
      // Al guardar/quitar un tweet, refrescamos las columnas de guardados.
      alCambiarGuardado: () => this.refrescarGuardados(),
      // Al pulsar "abrir" en un tweet, lo cargamos en la columna principal.
      alAbrir: (enlace) => this.abrirEnPrincipal(enlace),
      // Al pulsar el pin de una columna en vivo, la fijamos como principal.
      alFijarPrincipal: (id) => this.fijarPrincipal(id),
      // Al detectar una búsqueda en una webview, la añadimos como columna.
      alAnadirBusqueda: (b) => this.anadirBusqueda(b),
      alCambiarEstadoUi: (id, estado) => this.guardarEstadoColumna(id, estado),
      alExpandirWebview: (id, expandida) => this.setWebviewExpandida(id, expandida),
      alActivarColumna: (id) => this.activarColumna(id),
    };
  }

  setPreferencias({ estadoColumnas = {}, filtrosLocales = {}, anchoColumna = 380 } = {}) {
    this.estadoColumnas = estadoColumnas;
    this.filtrosLocales = filtrosLocales;
    this.anchoPredeterminado = anchoColumna;

    for (const [id, columna] of this.columnas) {
      columna.estadoUi = {
        colapsada: estadoColumnas[id]?.colapsada === true,
        expandida: columna.vivo && estadoColumnas[id]?.expandida === true,
        ancho: Number(estadoColumnas[id]?.ancho) || anchoColumna,
        leidoHasta: Number(estadoColumnas[id]?.leidoHasta) || 0,
      };
      columna.aplicarEstadoUi();
      columna.setFiltrosLocales(filtrosLocales);
    }
  }

  guardarEstadoColumna(id, estado) {
    this.estadoColumnas = { ...this.estadoColumnas, [id]: estado };
    window.api.guardarAjustes({ estadoColumnas: this.estadoColumnas }).catch((error) => {
      console.error('[ui] no se pudo guardar el estado de columnas:', error);
    });
  }

  setWebviewExpandida(id, expandida) {
    const objetivo = this.columnas.get(id);
    if (!objetivo?.vivo) return;

    const siguienteEstado = { ...this.estadoColumnas };
    for (const [columnaId, columna] of this.columnas) {
      if (!columna.vivo) continue;
      const debeExpandirse = columnaId === id && expandida === true;
      columna.estadoUi.expandida = debeExpandirse;
      if (debeExpandirse) columna.estadoUi.colapsada = false;
      columna.aplicarEstadoUi();
      siguienteEstado[columnaId] = { ...columna.estadoUi };
    }

    this.estadoColumnas = siguienteEstado;
    window.api.guardarAjustes({ estadoColumnas: siguienteEstado }).catch((error) => {
      console.error('[ui] no se pudo guardar la expansion de la WebView:', error);
    });

    if (expandida) {
      requestAnimationFrame(() => {
        this.activarColumna(id);
        objetivo.elemento.focus({ preventScroll: true });
      });
    }
  }

  setFiltrosLocales(filtros) {
    this.filtrosLocales = filtros;
    for (const columna of this.columnas.values()) columna.setFiltrosLocales(filtros);
  }

  setCosechaPausada(pausada) {
    this.cosechaPausada = pausada === true;
    for (const columna of this.columnas.values()) columna.setCosechaPausada(this.cosechaPausada);
  }

  setEspacioTrabajo(espacio) {
    this.espacioActivo = espacio ?? null;
    this.aplicarEspacioTrabajo();
  }

  aplicarEspacioTrabajo() {
    const permitidas = this.espacioActivo ? new Set(this.espacioActivo.columnas) : null;
    for (const [id, columna] of this.columnas) {
      const fuera = permitidas && !permitidas.has(id);
      columna.elemento.hidden = Boolean(fuera || columna.pendienteBorrado);
    }
    this.fijarPrincipal(this.principalId);
    if (!this.idsVisibles().includes(this.activaId)) this.activarColumna(this.idsVisibles()[0] ?? null);
    this.actualizarEstadoVacio();
  }

  idsVisibles() {
    return this.orden.filter((id) => {
      const columna = this.columnas.get(id);
      return columna && !columna.elemento.hidden;
    });
  }

  activarColumna(id) {
    this.activaId = this.columnas.has(id) ? id : null;
    for (const [columnaId, columna] of this.columnas) {
      columna.elemento.classList.toggle('columna--activa-teclado', columnaId === this.activaId);
    }
  }

  saltarAColumna(id) {
    const columna = this.columnas.get(id);
    if (!columna || columna.elemento.hidden) return;
    this.activarColumna(id);
    columna.elemento.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    columna.elemento.focus({ preventScroll: true });
  }

  navegarColumnas(direccion) {
    const ids = this.idsVisibles();
    if (ids.length === 0) return;
    let indice = ids.indexOf(this.activaId);
    if (direccion === 'primera') indice = 0;
    else if (direccion === 'ultima') indice = ids.length - 1;
    else if (direccion === 'anterior') indice = indice <= 0 ? ids.length - 1 : indice - 1;
    else indice = indice < 0 || indice >= ids.length - 1 ? 0 : indice + 1;
    this.saltarAColumna(ids[indice]);
  }

  /** Muestra el estado global del tablero: carga, vacío o error. */
  mostrarEstado(estado, mensaje = '') {
    if (!this.estadoTablero) return;

    const contenido = {
      cargando: {
        titulo: 'Cargando columnas',
        texto: 'Leyendo la configuración guardada en este equipo.',
      },
      vacio: {
        titulo: 'Construye tu tablero',
        texto: 'Añade una columna de inicio, una lista, un perfil o una búsqueda para comenzar.',
      },
      'espacio-vacio': {
        titulo: 'Este espacio está vacío',
        texto: 'Añade una columna o cambia a “Todas las columnas” desde la barra.',
      },
      error: {
        titulo: 'No pudimos abrir el tablero',
        texto: mensaje || 'Revisa la conexión con el proceso principal e inténtalo de nuevo.',
      },
    }[estado];

    if (!contenido) return;

    this.estadoTablero.hidden = false;
    this.estadoTablero.dataset.estado = estado;
    this.estadoTitulo.textContent = contenido.titulo;
    this.estadoTexto.textContent = contenido.texto;
    this.botonEstadoAnadir.hidden = !['vacio', 'espacio-vacio'].includes(estado);
    this.botonEstadoReintentar.hidden = estado !== 'error';
    this.contenedor.setAttribute('aria-busy', String(estado === 'cargando'));
  }

  /** Oculta el estado global cuando ya existen columnas. */
  actualizarEstadoVacio() {
    if (this.columnas.size === 0) {
      this.mostrarEstado('vacio');
      return;
    }
    if (this.idsVisibles().length === 0) {
      this.mostrarEstado('espacio-vacio');
      return;
    }

    this.estadoTablero.hidden = true;
    this.contenedor.setAttribute('aria-busy', 'false');
  }

  /** Crea una columna de búsqueda a partir de lo detectado en una webview. */
  async anadirBusqueda({ query, orden, titulo }) {
    await window.api.crearColumna({
      titulo: 'Búsqueda: ' + titulo,
      tipo: 'search',
      fuente: query,
      filtros: { orden },
    });
    if (this.recargar) await this.recargar();
  }

  /** Las columnas en vivo, de izquierda a derecha tal y como se ven. */
  columnasEnVivo() {
    // Se recorre `orden` y no el Map: desde que se pueden reordenar, el orden de
    // insercion en el Map ya no es el orden en que se ven.
    return this.orden
      .map((id) => this.columnas.get(id))
      .filter((columna) => columna && columna.vivo && !columna.elemento.hidden);
  }

  /** Fija (o revalida) cuál es la columna principal y actualiza el marcado. */
  fijarPrincipal(id) {
    const enVivo = this.columnasEnVivo();
    // Si el id pedido no es una columna en vivo válida, usamos la primera.
    const valido = enVivo.some((c) => c.columna.id === id);
    this.principalId = valido ? id : (enVivo[0]?.columna.id ?? null);

    for (const columna of enVivo) {
      columna.marcarPrincipal(columna.columna.id === this.principalId);
    }
  }

  /** Abre un enlace de tweet en la columna principal, o en la ventana de X si no hay. */
  abrirEnPrincipal(enlace) {
    const principal = this.columnas.get(this.principalId);
    if (principal && principal.vivo) {
      principal.navegar(enlace);
    } else {
      // No hay columna en vivo: lo abrimos en la ventana aparte de X.
      window.api.abrirEnX(enlace);
    }
  }

  /**
   * Pinta el orden dado: a cada columna le pone su `order` de flexbox.
   *
   * Reordenar asi, y no moviendo nodos, es lo que permite reordenar columnas EN
   * VIVO sin que su <webview> se recargue (ver arrastre.js).
   *
   * @param {number[]} ids
   */
  aplicarOrden(ids) {
    this.orden = ids;

    ids.forEach((id, indice) => {
      const columna = this.columnas.get(id);
      if (columna) columna.elemento.style.order = indice;
    });
  }

  combinarOrdenVisible(idsVisibles) {
    const visibles = new Set(idsVisibles);
    const cola = [...idsVisibles];
    return this.orden.map((id) => (visibles.has(id) ? cola.shift() : id));
  }

  aplicarOrdenVisible(idsVisibles) {
    this.aplicarOrden(this.combinarOrdenVisible(idsVisibles));
  }

  async guardarOrdenVisible(idsVisibles) {
    await this.guardarOrden(this.combinarOrdenVisible(idsVisibles));
  }

  /**
   * Aplica el ajuste de auto-clic a todas las columnas en vivo.
   * Se guarda para que las columnas que se creen después nazcan ya con el valor.
   *
   * @param {boolean} activo
   */
  setAutoMostrarPosts(activo) {
    this.autoMostrarPosts = activo;

    for (const columna of this.columnasEnVivo()) {
      columna.enviarAutoMostrarPosts(activo);
    }
  }

  /** Guarda el orden en la base de datos. No reconfigura la cosecha: es solo visual. */
  async guardarOrden(ids) {
    this.aplicarOrden(ids);
    await window.api.reordenarColumnas(ids);
  }

  /** Reconstruye el tablero a partir de la lista de columnas de la base de datos. */
  async sincronizar(columnas) {
    const idsAntes = new Set(this.columnas.keys());
    const idsActuales = new Set(columnas.map((c) => c.id));

    // Quita las que ya no existen.
    for (const [id, columna] of this.columnas) {
      if (!idsActuales.has(id)) {
        columna.destruir();
        this.columnas.delete(id);
      }
    }

    // Añade las nuevas. Al DOM se añaden al final y ahi se quedan para siempre:
    // el orden que se ve lo decide `order`, mas abajo.
    for (const datos of columnas) {
      if (this.columnas.has(datos.id)) continue;

      const columna = new Columna(datos, (id) => this.borrar(id), {
        ...this.acciones,
        estadoUi: this.estadoColumnas[datos.id],
        filtrosLocales: this.filtrosLocales,
        anchoPredeterminado: this.anchoPredeterminado,
      });
      this.columnas.set(datos.id, columna);
      this.contenedor.appendChild(columna.elemento);
      this.arrastre.conectar(datos.id, columna.cabecera);
      // Una columna en vivo recién creada tiene que nacer con el ajuste puesto.
      columna.enviarAutoMostrarPosts(this.autoMostrarPosts === true);
      columna.setCosechaPausada(this.cosechaPausada);
      await columna.refrescar();
    }

    // `columnas` ya viene ordenada por posicion desde la base de datos.
    this.aplicarOrden(columnas.map((c) => c.id));

    // Reaplica cuál es la principal (por defecto, la primera en vivo).
    this.fijarPrincipal(this.principalId);
    const nuevas = columnas.map((c) => c.id).filter((id) => !idsAntes.has(id));
    if (this.inicializado && this.espacioActivo && nuevas.length > 0) {
      this.espacioActivo.columnas = [...new Set([...this.espacioActivo.columnas, ...nuevas])];
      if (this.ui.alActualizarEspacio) this.ui.alActualizarEspacio(this.espacioActivo);
    }
    this.aplicarEspacioTrabajo();
    if (this.activaId === null) this.activarColumna(this.idsVisibles()[0] ?? null);
    this.actualizarEstadoVacio();
    this.inicializado = true;
  }

  async refrescarColumna(columnaId) {
    const columna = this.columnas.get(columnaId);
    if (columna) await columna.refrescar();
  }

  /** Pasa un cambio de estado de cosecha a su columna. */
  setEstadoColumna(columnaId, estado) {
    const columna = this.columnas.get(columnaId);
    if (columna) columna.setEstado(estado);
  }

  registrarNuevos(columnaId, nuevos) {
    const columna = this.columnas.get(columnaId);
    if (columna && nuevos > 0) columna.refrescar();
  }

  async refrescarTodas() {
    for (const columna of this.columnas.values()) {
      await columna.refrescar();
    }
  }

  /** Refresca solo las columnas de guardados (tras marcar/quitar una estrella). */
  async refrescarGuardados() {
    for (const columna of this.columnas.values()) {
      if (columna.esGuardados) await columna.refrescar();
    }
  }

  reiniciar() {
    if (this.borradoPendiente) clearTimeout(this.borradoPendiente.temporizador);
    this.borradoPendiente = null;
    for (const columna of this.columnas.values()) columna.destruir();
    this.columnas.clear();
    this.orden = [];
    this.principalId = null;
    this.activaId = null;
    this.inicializado = false;
  }

  async borrar(columnaId) {
    const columna = this.columnas.get(columnaId);
    if (!columna || columna.pendienteBorrado) return;

    if (this.borradoPendiente) await this.confirmarBorrado(this.borradoPendiente.columnaId);

    columna.pendienteBorrado = true;
    this.aplicarEspacioTrabajo();
    const temporizador = setTimeout(() => this.confirmarBorrado(columnaId), 8000);
    this.borradoPendiente = { columnaId, temporizador };

    if (this.ui.mostrarDeshacer) {
      this.ui.mostrarDeshacer({
        mensaje: `Columna “${columna.columna.titulo}” retirada`,
        alDeshacer: () => this.deshacerBorrado(columnaId),
      });
    }
  }

  deshacerBorrado(columnaId) {
    if (!this.borradoPendiente || this.borradoPendiente.columnaId !== columnaId) return;
    clearTimeout(this.borradoPendiente.temporizador);
    const columna = this.columnas.get(columnaId);
    if (columna) columna.pendienteBorrado = false;
    this.borradoPendiente = null;
    this.aplicarEspacioTrabajo();
    if (this.ui.ocultarDeshacer) this.ui.ocultarDeshacer();
  }

  async confirmarBorrado(columnaId) {
    const pendiente = this.borradoPendiente;
    if (!pendiente || pendiente.columnaId !== columnaId) return;
    clearTimeout(pendiente.temporizador);
    this.borradoPendiente = null;

    try {
      await window.api.borrarColumna(columnaId);
    } catch (error) {
      const columna = this.columnas.get(columnaId);
      if (columna) columna.pendienteBorrado = false;
      this.aplicarEspacioTrabajo();
      if (this.ui.mostrarMensaje) this.ui.mostrarMensaje('No se pudo quitar la columna');
      return;
    }

    const columna = this.columnas.get(columnaId);
    if (columna) columna.destruir();
    this.columnas.delete(columnaId);
    this.aplicarOrden(this.orden.filter((id) => id !== columnaId));

    const estado = { ...this.estadoColumnas };
    delete estado[columnaId];
    this.estadoColumnas = estado;
    window.api.guardarAjustes({ estadoColumnas: estado });
    if (this.ui.alEliminarColumna) this.ui.alEliminarColumna(columnaId);

    // Si borramos la principal, reasignamos a la siguiente columna en vivo.
    if (columnaId === this.principalId) this.fijarPrincipal(null);

    this.actualizarEstadoVacio();
  }
}
