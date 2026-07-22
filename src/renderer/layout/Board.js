// El tablero: contiene las columnas y las mantiene sincronizadas con main.

import { Columna } from './Column.js';
import { ArrastreDeColumnas } from './arrastre.js';

export class Tablero {
  /**
   * @param {HTMLElement} contenedor
   * @param {() => Promise<void>} [recargar] Vuelve a leer las columnas de main
   */
  constructor(contenedor, recargar = null) {
    this.contenedor = contenedor;
    this.recargar = recargar;
    // columnaId -> instancia de Columna
    this.columnas = new Map();

    // Ids en el orden en que se ven, de izquierda a derecha. Es la fuente de
    // verdad del orden: el DOM NO se reordena nunca (ver arrastre.js).
    this.orden = [];

    // Id de la columna en vivo "principal": donde se abren los tweets.
    this.principalId = null;

    this.arrastre = new ArrastreDeColumnas(contenedor, {
      obtenerOrden: () => this.orden,
      elementoDe: (id) => this.columnas.get(id).elemento,
      // Mientras arrastras: repinta el orden, pero no toca la base de datos.
      alReordenar: (ids) => this.aplicarOrden(ids),
      // Al soltar: ya es definitivo, lo guardamos.
      alSoltar: (ids) => this.guardarOrden(ids),
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
    };
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
      .filter((columna) => columna && columna.vivo);
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

      const columna = new Columna(datos, (id) => this.borrar(id), this.acciones);
      this.columnas.set(datos.id, columna);
      this.contenedor.appendChild(columna.elemento);
      this.arrastre.conectar(datos.id, columna.cabecera);
      // Una columna en vivo recién creada tiene que nacer con el ajuste puesto.
      columna.enviarAutoMostrarPosts(this.autoMostrarPosts === true);
      await columna.refrescar();
    }

    // `columnas` ya viene ordenada por posicion desde la base de datos.
    this.aplicarOrden(columnas.map((c) => c.id));

    // Reaplica cuál es la principal (por defecto, la primera en vivo).
    this.fijarPrincipal(this.principalId);
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

  async borrar(columnaId) {
    await window.api.borrarColumna(columnaId);
    const columna = this.columnas.get(columnaId);
    if (columna) {
      columna.destruir();
      this.columnas.delete(columnaId);
    }
    // Fuera del orden tambien, o al arrastrar buscariamos una columna que ya no esta.
    this.aplicarOrden(this.orden.filter((id) => id !== columnaId));

    // Si borramos la principal, reasignamos a la siguiente columna en vivo.
    if (columnaId === this.principalId) this.fijarPrincipal(null);
  }
}
