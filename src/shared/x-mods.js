// Catalogo de modificaciones opcionales para la X original.
//
// Este archivo solo contiene datos y normalizacion. El codigo que toca el DOM de
// X vive en src/preload/x-inject.js, dentro del contexto aislado de Electron.

const CATALOGO_MODS_X = Object.freeze([
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
