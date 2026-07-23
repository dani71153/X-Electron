// Arrastrar columnas por su cabecera para reordenarlas.
//
// DECISION CLAVE: NO movemos nodos del DOM. Reordenamos con la propiedad `order`
// de flexbox (el tablero ya es display:flex).
//
// POR QUE: las columnas en vivo son <webview>. Mover un <webview> dentro del DOM
// lo desconecta y lo vuelve a conectar, y eso DESTRUYE su proceso invitado: X se
// recarga desde cero, se pierde el scroll y la navegacion, y una carga en frio de
// X dispara una rafaga de peticiones (justo lo que evita la politica anti-bloqueo).
// Cambiando solo `order` no se toca un nodo: las webviews ni se enteran.
//
// SEGUNDA TRAMPA: las <webview> se tragan los eventos del raton. Al pasar el
// puntero por encima de una columna en vivo perderiamos el rastro a mitad del
// arrastre. Por eso, mientras dura, el tablero lleva la clase
// `tablero--arrastrando`, que les pone pointer-events:none (ver base.css).

/** ¿Son los dos arrays la misma lista de ids en el mismo orden? */
function mismoOrden(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export class ArrastreDeColumnas {
  /**
   * @param {HTMLElement} contenedor El elemento .tablero
   * @param {object} manejadores
   * @param {() => number[]} manejadores.obtenerOrden Ids en el orden visual actual
   * @param {(id: number) => HTMLElement} manejadores.elementoDe El nodo de una columna
   * @param {(ids: number[]) => void} manejadores.alReordenar Repinta el orden (aplica `order`)
   * @param {(ids: number[]) => void} manejadores.alSoltar Guarda el orden definitivo
   */
  constructor(contenedor, manejadores) {
    this.contenedor = contenedor;
    this.manejadores = manejadores;

    // Datos del arrastre en curso, o null si no hay ninguno.
    this.actual = null;

    // Se guardan para poder quitarlos luego: hay que pasar la MISMA referencia
    // a removeEventListener que la que se paso a addEventListener.
    this.alMover = (evento) => this.mover(evento);
    this.alTerminar = () => this.terminar();
  }

  /**
   * Hace que una columna se pueda arrastrar por su cabecera.
   * Se llama una vez por columna, al crearla.
   */
  conectar(columnaId, cabecera) {
    cabecera.addEventListener('pointerdown', (evento) => this.empezar(evento, columnaId, cabecera));
  }

  empezar(evento, columnaId, cabecera) {
    if (evento.button !== 0) return; // solo boton izquierdo
    if (this.actual) return; // ya hay un arrastre en curso

    // La cabecera lleva botones de acción. Si el clic es en uno, es un clic
    // normal, no un arrastre.
    if (evento.target.closest('button')) return;

    evento.preventDefault(); // si no, el navegador intenta arrastrar el texto

    // Con la captura, seguimos recibiendo los eventos aunque el puntero se salga
    // de la cabecera (que es lo normal en cuanto empiezas a mover).
    cabecera.setPointerCapture(evento.pointerId);

    this.actual = {
      id: columnaId,
      cabecera,
      pointerId: evento.pointerId,
      orden: this.manejadores.obtenerOrden(),
    };

    this.contenedor.classList.add('tablero--arrastrando');
    this.manejadores.elementoDe(columnaId).classList.add('columna--arrastrando');

    cabecera.addEventListener('pointermove', this.alMover);
    cabecera.addEventListener('pointerup', this.alTerminar);
    cabecera.addEventListener('pointercancel', this.alTerminar);
  }

  /**
   * ¿En que posicion hay que meter la columna que arrastramos?
   *
   * Cuenta cuantas de las OTRAS columnas tienen su centro a la izquierda del
   * puntero. Como estan ordenadas de izquierda a derecha, esa cuenta es
   * directamente el indice donde hay que insertarla.
   */
  calcularIndice(clientX, otros) {
    let indice = 0;

    for (const otroId of otros) {
      const rect = this.manejadores.elementoDe(otroId).getBoundingClientRect();
      const centro = rect.left + rect.width / 2;
      if (clientX > centro) indice++;
    }

    return indice;
  }

  mover(evento) {
    if (!this.actual) return;

    this.desplazarBordes(evento.clientX);

    const { id, orden } = this.actual;

    const otros = orden.filter((otroId) => otroId !== id);
    const indice = this.calcularIndice(evento.clientX, otros);

    const nuevo = [...otros];
    nuevo.splice(indice, 0, id);

    if (mismoOrden(nuevo, orden)) return; // no ha cambiado nada

    this.actual.orden = nuevo;
    this.manejadores.alReordenar(nuevo); // las columnas se apartan en vivo
  }

  /**
   * Si arrastras pegado a un borde, desplaza el tablero para poder soltar en una
   * columna que no se ve. Solo se mueve mientras mueves el raton; es lo mas
   * simple que funciona y evita meter un temporizador.
   */
  desplazarBordes(clientX) {
    const MARGEN = 60; // px desde el borde donde empieza a desplazarse
    const PASO = 20; // px que desplaza en cada movimiento

    const rect = this.contenedor.getBoundingClientRect();

    if (clientX < rect.left + MARGEN) {
      this.contenedor.scrollLeft -= PASO;
    } else if (clientX > rect.right - MARGEN) {
      this.contenedor.scrollLeft += PASO;
    }
  }

  terminar() {
    if (!this.actual) return;

    const { id, cabecera, pointerId, orden } = this.actual;

    cabecera.removeEventListener('pointermove', this.alMover);
    cabecera.removeEventListener('pointerup', this.alTerminar);
    cabecera.removeEventListener('pointercancel', this.alTerminar);

    if (cabecera.hasPointerCapture(pointerId)) {
      cabecera.releasePointerCapture(pointerId);
    }

    this.contenedor.classList.remove('tablero--arrastrando');
    this.manejadores.elementoDe(id).classList.remove('columna--arrastrando');

    this.actual = null;

    this.manejadores.alSoltar(orden);
  }
}
