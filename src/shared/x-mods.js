// Catalogo de modificaciones opcionales para la X original.
//
// Este archivo solo contiene datos y normalizacion. El codigo que toca el DOM de
// X vive en src/preload/x-inject.js, dentro del contexto aislado de Electron.

const CATALOGO_MODS_X = Object.freeze([
  Object.freeze({
    id: 'fuenteTendencias', nombre: 'Fuente de tendencias',
    descripcion: 'Conserva una lista separada para cada fuente. Explorar usa tu sesion y las preferencias de ubicacion de X.',
    tipo: 'Apariencia', control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'columnas', nombre: 'Desde las columnas (actual)' }),
      Object.freeze({ valor: 'explorar', nombre: 'Explorar > Tendencias' }),
    ]),
    predeterminado: 'columnas',
  }),
  Object.freeze({
    id: 'ocultarAnuncios',
    nombre: 'Ocultar anuncios del feed',
    descripcion: 'Oculta publicaciones marcadas como Anuncio, Ad o Promoted y colapsa su espacio. No filtra noticias de cuentas normales.',
    tipo: 'Apariencia',
    control: 'toggle',
    predeterminado: true,
  }),
  Object.freeze({
    id: 'abrirTendencias',
    nombre: 'Abrir tendencias en',
    descripcion: 'Elige entre navegar en la pagina actual o ver la busqueda en una ventana modal sin perder tu pagina.',
    tipo: 'Apariencia',
    control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'pagina', nombre: 'Pagina actual' }),
      Object.freeze({ valor: 'modal', nombre: 'Modal de busqueda' }),
    ]),
    predeterminado: 'pagina',
  }),
  Object.freeze({
    id: 'panelTendencias',
    nombre: 'Tendencias a la derecha',
    descripcion: 'Muestra los temas capturados por la app en el espacio libre junto a los posts. Requiere Interfaz limpia y al menos 260 px libres.',
    tipo: 'Apariencia',
    control: 'toggle',
    predeterminado: true,
  }),
  Object.freeze({
    id: 'anchoPosts',
    nombre: 'Ancho de los posts',
    descripcion: 'Ancho en pixeles de la columna y sus publicaciones. Se adapta al espacio disponible. Requiere Interfaz limpia.',
    tipo: 'Apariencia',
    control: 'range',
    min: 320,
    max: 10000,
    maxBarra: 1600,
    predeterminado: 600,
  }),
  Object.freeze({
    id: 'direccionAnchoPosts',
    nombre: 'Direccion del ancho',
    descripcion: 'Respecto al ancho original de 600 px. Hacia la izquierda utiliza el margen disponible sin cubrir el menu.',
    tipo: 'Apariencia',
    control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'simetrico', nombre: 'Simetrico' }),
      Object.freeze({ valor: 'izquierda', nombre: 'Hacia la izquierda' }),
      Object.freeze({ valor: 'derecha', nombre: 'Hacia la derecha' }),
    ]),
    predeterminado: 'derecha',
  }),
  Object.freeze({
    id: 'margenIzquierdo',
    nombre: 'Margen izquierdo de X',
    descripcion: 'Separacion entre el borde y el menu, en pixeles. Requiere Interfaz limpia.',
    tipo: 'Apariencia',
    control: 'range',
    min: 0,
    max: 10000,
    maxBarra: 600,
    predeterminado: 12,
  }),
  Object.freeze({
    id: 'interfazLimpia',
    nombre: 'Interfaz limpia',
    descripcion: 'Oculta la columna lateral de tendencias y aprovecha su espacio.',
    tipo: 'Apariencia',
    control: 'toggle',
    predeterminado: true,
  }),
  Object.freeze({
    id: 'ocultarPremium',
    nombre: 'Ocultar promociones de Premium',
    descripcion: 'Quita las tarjetas y botones flotantes que promocionan Premium.',
    tipo: 'Apariencia',
    control: 'toggle',
    predeterminado: true,
  }),
  Object.freeze({
    id: 'ordenInicio',
    nombre: 'Orden del inicio',
    descripcion:
      'Conserva el algoritmo de X o mantiene abierto “Siguiendo”, con los recientes primero. X solo carga una parte del historial, por eso no se puede invertir completo aquí.',
    tipo: 'Organización',
    control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'original', nombre: 'Algoritmo de X' }),
      Object.freeze({ valor: 'recientes', nombre: 'Siguiendo · recientes primero' }),
    ]),
    predeterminado: 'original',
  }),
  Object.freeze({
    id: 'separadoresTimeline',
    nombre: 'Separadores visuales',
    descripcion:
      'Añade etiquetas sobre los posts sin moverlos ni alterar el espacio calculado por X.',
    tipo: 'Organización',
    control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'ninguno', nombre: 'Sin separadores' }),
      Object.freeze({ valor: 'dia', nombre: 'Separar por día' }),
      Object.freeze({ valor: 'contenido', nombre: 'Separar texto y multimedia' }),
    ]),
    predeterminado: 'dia',
  }),
  Object.freeze({
    id: 'ordenVisibleExperimental',
    nombre: 'Orden visible experimental',
    descripcion:
      'Reubica solo los posts ya cargados. Puede saltar al hacer scroll y no representa el historial completo.',
    tipo: 'Experimental',
    control: 'select',
    opciones: Object.freeze([
      Object.freeze({ valor: 'original', nombre: 'No manipular' }),
      Object.freeze({ valor: 'recientes', nombre: 'Visibles · recientes primero' }),
      Object.freeze({ valor: 'antiguos', nombre: 'Visibles · antiguos primero' }),
    ]),
    predeterminado: 'original',
  }),
  Object.freeze({
    id: 'autoMostrarPosts',
    nombre: 'Mostrar posts nuevos automáticamente',
    descripcion:
      'Pulsa “Mostrar N posts” cuando aparece, usando un intervalo variable cercano a 45 segundos.',
    tipo: 'Automatización',
    control: 'toggle',
    predeterminado: false,
  }),
]);

const MODS_X_POR_DEFECTO = Object.freeze(
  Object.fromEntries(CATALOGO_MODS_X.map((mod) => [mod.id, mod.predeterminado])),
);

/**
 * Conserva solo ids conocidos y valores válidos para cada tipo de control.
 * Los mods nuevos toman su valor predeterminado sin romper configuraciones viejas.
 */
function normalizarModsX(valor, fallback = MODS_X_POR_DEFECTO) {
  const entrada = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  const base = fallback && typeof fallback === 'object' ? fallback : MODS_X_POR_DEFECTO;
  const resultado = {};

  for (const mod of CATALOGO_MODS_X) {
    if (mod.control === 'range') {
      const normalizar = (valor, fallback) =>
        typeof valor === 'number' && Number.isFinite(valor)
          ? Math.max(mod.min, Math.min(mod.max, Math.round(valor)))
          : fallback;
      resultado[mod.id] = normalizar(entrada[mod.id], normalizar(base[mod.id], mod.predeterminado));
      continue;
    }
    if (mod.control === 'select') {
      const permitidos = new Set(mod.opciones.map((opcion) => opcion.valor));
      const valorBase = permitidos.has(base[mod.id]) ? base[mod.id] : mod.predeterminado;
      resultado[mod.id] = permitidos.has(entrada[mod.id]) ? entrada[mod.id] : valorBase;
      continue;
    }

    resultado[mod.id] =
      typeof entrada[mod.id] === 'boolean' ? entrada[mod.id] : base[mod.id] === true;
  }

  return resultado;
}

module.exports = { CATALOGO_MODS_X, MODS_X_POR_DEFECTO, normalizarModsX };
