// Extrae las listas del usuario del JSON de X.
//
// Igual que con los tweets, no seguimos una ruta fija: recorremos el JSON
// buscando cualquier nodo que sea una lista. Asi sobrevivimos a que X cambie el
// nombre de la operacion o la estructura de la pagina.

const PROFUNDIDAD_MAXIMA = 30;

/**
 * ¿Este nodo es una lista de X?
 * Aceptamos por __typename, o por forma (tiene id_str + name + contador).
 */
function esNodoLista(nodo) {
  if (!nodo || typeof nodo !== 'object') return false;
  if (nodo.__typename === 'List') return true;
  return (
    typeof nodo.id_str === 'string' &&
    typeof nodo.name === 'string' &&
    typeof nodo.member_count === 'number'
  );
}

/** Saca la URL del banner de la lista, si la trae. */
function bannerDeLista(nodo) {
  return (
    nodo.custom_banner_media?.media_info?.original_img_url ??
    nodo.default_banner_media?.media_info?.original_img_url ??
    ''
  );
}

/**
 * Convierte un nodo lista crudo en nuestro objeto.
 * @returns {{id: string, nombre: string, descripcion: string, miembros: number, modo: string, bannerUrl: string}|null}
 */
function normalizarLista(nodo) {
  if (!esNodoLista(nodo)) return null;

  const id = nodo.id_str ?? nodo.rest_id;
  const nombre = nodo.name;
  if (!id || !nombre) return null;

  return {
    id: String(id),
    nombre: String(nombre),
    descripcion: nodo.description ?? '',
    miembros: Number(nodo.member_count ?? 0),
    // 'Private' o 'Public'; lo guardamos en minusculas.
    modo: String(nodo.mode ?? 'public').toLowerCase(),
    bannerUrl: bannerDeLista(nodo),
  };
}

/** Combina dos versiones de la misma lista, prefiriendo los campos con datos. */
function fusionarListas(a, b) {
  return {
    id: a.id,
    nombre: b.nombre || a.nombre,
    descripcion: b.descripcion || a.descripcion,
    miembros: Math.max(a.miembros, b.miembros),
    modo: b.modo || a.modo,
    bannerUrl: b.bannerUrl || a.bannerUrl,
  };
}

/**
 * Recorre el JSON completo y devuelve todas las listas que encuentre, sin repetir.
 * @param {object} json Respuesta de X
 * @returns {object[]}
 */
function extraerListas(json) {
  const encontradas = new Map();
  const vistos = new Set();

  function recorrer(nodo, profundidad) {
    if (!nodo || typeof nodo !== 'object') return;
    if (profundidad > PROFUNDIDAD_MAXIMA) return;
    if (vistos.has(nodo)) return;
    vistos.add(nodo);

    if (esNodoLista(nodo)) {
      const lista = normalizarLista(nodo);
      if (lista) {
        // Si la misma lista aparece varias veces (una rica, otra escueta),
        // fusionamos quedándonos con los campos que traen datos.
        const previa = encontradas.get(lista.id);
        encontradas.set(lista.id, previa ? fusionarListas(previa, lista) : lista);
      }
      // No hacemos return: una lista puede anidar al usuario dueño, seguimos.
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

module.exports = { extraerListas, normalizarLista };
