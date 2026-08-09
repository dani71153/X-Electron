// Extrae las tendencias del JSON de X.
//
// Igual que el parser de listas, no seguimos una ruta fija: recorremos el JSON
// buscando cualquier nodo que parezca una tendencia. X las manda de dos formas
// segun la version:
//
//   GraphQL:  { __typename: 'TimelineTrend', name, trend_url: { url },
//               trendMetadata: { domainContext, metaDescription } }
//   REST:     { name, url: { url }, meta_description, ... }  (guide.json)
//
// Aceptamos las dos y normalizamos a un solo objeto.

const PROFUNDIDAD_MAXIMA = 30;

/** ¿Este nodo es una tendencia? */
function esNodoTendencia(nodo) {
  if (!nodo || typeof nodo !== 'object') return false;
  if (nodo.__typename === 'TimelineTrend') return true;

  // Forma REST: nombre + una URL que apunta a una busqueda.
  if (typeof nodo.name !== 'string' || nodo.name === '') return false;
  const url = nodo.url?.url ?? nodo.trend_url?.url;
  return typeof url === 'string' && /(\?|&)(q|query)=/.test(url);
}

/**
 * Saca los terminos de busqueda de la URL de la tendencia.
 * Las URLs pueden ser de app ("twitter://search?query=...") o web
 * ("/search?q=..."), asi que no usamos URL() y leemos el parametro a mano.
 */
function consultaDeTendencia(nodo) {
  const url = nodo.trend_url?.url ?? nodo.url?.url ?? '';
  const encontrado = /[?&](?:q|query)=([^&]+)/.exec(url);
  if (encontrado) {
    try {
      return decodeURIComponent(encontrado[1].replace(/\+/g, ' '));
    } catch {
      /* porcentajes rotos: nos quedamos con el nombre */
    }
  }
  // Sin URL utilizable, buscar el propio nombre es una aproximacion razonable.
  return String(nodo.name ?? '').trim();
}

/** "12.3K posts" / "12,3 mil posts" -> 12300. Devuelve 0 si no hay numero. */
function numeroDePosts(texto) {
  // Ojo con el orden: "millones" y "mil" van antes que "M", porque si no la M
  // de "mil" se leeria como millones y multiplicaria por mil de mas.
  const encontrado = /([\d.,]+)\s*(millones|mil|k|m)?(?![a-z])/i.exec(String(texto ?? ''));
  if (!encontrado) return 0;

  // X usa la coma o el punto como separador decimal segun el idioma. Nos
  // quedamos con el ultimo separador como decimal y quitamos el resto.
  const crudo = encontrado[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
  const base = Number(crudo);
  if (!Number.isFinite(base)) return 0;

  const sufijo = (encontrado[2] ?? '').toLowerCase();
  if (sufijo === 'k' || sufijo === 'mil') return Math.round(base * 1000);
  if (sufijo === 'm' || sufijo === 'millones') return Math.round(base * 1000000);
  return Math.round(base);
}

/**
 * Convierte un nodo crudo en nuestra tendencia.
 * @returns {{nombre: string, consulta: string, contexto: string, descripcion: string, posts: number, posicion: number}|null}
 */
function normalizarTendencia(nodo, posicion) {
  if (!esNodoTendencia(nodo)) return null;

  const nombre = String(nodo.name ?? '').trim();
  if (nombre === '') return null;

  const metadatos = nodo.trendMetadata ?? {};
  const descripcion = String(metadatos.metaDescription ?? nodo.meta_description ?? '').trim();

  return {
    nombre,
    consulta: consultaDeTendencia(nodo),
    // "Tendencia en España", "Deportes"... X lo manda ya traducido.
    contexto: String(metadatos.domainContext ?? nodo.domain_context ?? '').trim(),
    descripcion,
    posts: numeroDePosts(descripcion),
    posicion,
  };
}

/**
 * Recorre el JSON completo y devuelve las tendencias que encuentre, sin repetir.
 * El orden de aparicion es el ranking de X, y lo conservamos en `posicion`.
 *
 * @param {object} json Respuesta de X
 * @returns {object[]}
 */
function extraerTendencias(json) {
  const encontradas = new Map();
  const vistos = new Set();

  function recorrer(nodo, profundidad) {
    if (!nodo || typeof nodo !== 'object') return;
    if (profundidad > PROFUNDIDAD_MAXIMA) return;
    if (vistos.has(nodo)) return;
    vistos.add(nodo);

    if (esNodoTendencia(nodo)) {
      const tendencia = normalizarTendencia(nodo, encontradas.size + 1);
      // La primera aparicion manda: es la que lleva la posicion real del ranking.
      if (tendencia && !encontradas.has(tendencia.nombre)) {
        encontradas.set(tendencia.nombre, tendencia);
      }
      return; // dentro de una tendencia no hay otra tendencia
    }

    if (Array.isArray(nodo)) {
      for (const hijo of nodo) recorrer(hijo, profundidad + 1);
    } else {
      for (const clave of Object.keys(nodo)) recorrer(nodo[clave], profundidad + 1);
    }
  }

  recorrer(json, 0);
  return [...encontradas.values()];
}

module.exports = { extraerTendencias, normalizarTendencia, numeroDePosts };
