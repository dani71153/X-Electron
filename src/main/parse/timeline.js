// Recorre la respuesta JSON de X y saca todos los tweets que encuentre.
//
// X anida los tweets dentro de "instructions" -> "entries" -> "content" ->
// "itemContent" -> "tweet_results" -> "result", y la ruta exacta cambia segun
// el endpoint (timeline, busqueda, hilo, modulo de conversacion...).
//
// En vez de seguir una ruta fija y frágil, recorremos todo el objeto buscando
// cualquier nodo `tweet_results.result`. Sobrevive a los rediseños de X.

const { normalizarTweet } = require('./tweet');

const PROFUNDIDAD_MAXIMA = 30;

// Claves de X que contienen un tweet dentro de `.result`.
//
// El valor dice si ese tweet FORMABA PARTE del timeline que estamos leyendo:
//
// tweet_results           -> si. Es una entrada de la lista.
// retweeted_status_result -> si. En un retweet, X pinta el tweet original.
// quoted_status_result    -> NO. El tweet citado va embebido dentro de otro;
//                            no aparecia en el timeline por si mismo.
//
// Los tres se GUARDAN en la base de datos. Pero solo los marcados como `true`
// se vinculan a la columna. Si no, las columnas se llenarian de tweets citados
// que el usuario nunca vio en ese timeline.
const CLAVES_CON_TWEET = {
  tweet_results: true,
  retweeted_status_result: true,
  quoted_status_result: false,
};

/**
 * Busca recursivamente todos los tweets del JSON.
 * @returns {{crudo: object, esDeColumna: boolean}[]}
 */
function buscarTweetsCrudos(nodo, profundidad = 0, vistos = new Set()) {
  if (!nodo || typeof nodo !== 'object') return [];
  if (profundidad > PROFUNDIDAD_MAXIMA) return [];

  // Evita ciclos y trabajo repetido si el mismo objeto aparece dos veces.
  if (vistos.has(nodo)) return [];
  vistos.add(nodo);

  const encontrados = [];

  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      encontrados.push(...buscarTweetsCrudos(hijo, profundidad + 1, vistos));
    }
    return encontrados;
  }

  // Los nodos que buscamos.
  for (const [clave, esDeColumna] of Object.entries(CLAVES_CON_TWEET)) {
    const contenedor = nodo[clave];
    if (contenedor && typeof contenedor === 'object' && contenedor.result) {
      encontrados.push({ crudo: contenedor.result, esDeColumna });
    }
  }

  // Seguimos bajando por todo: un tweet puede citar a otro que cita a otro.
  for (const clave of Object.keys(nodo)) {
    encontrados.push(...buscarTweetsCrudos(nodo[clave], profundidad + 1, vistos));
  }

  return encontrados;
}

/**
 * Punto de entrada: JSON crudo de X -> tweets y autores listos para guardar.
 *
 * Cada tweet lleva `esDeColumna`: true si aparecia en el timeline, false si solo
 * iba embebido como cita dentro de otro tweet.
 *
 * @param {object} json La respuesta completa de un endpoint de timeline
 * @returns {{tweets: object[], autores: object[]}}
 */
function extraerTimeline(json) {
  const crudos = buscarTweetsCrudos(json);

  // Un mismo tweet puede aparecer varias veces (retweet + original, cita + citado).
  const tweets = new Map();
  const autores = new Map();

  for (const { crudo, esDeColumna } of crudos) {
    const normalizado = normalizarTweet(crudo);
    if (!normalizado) continue;

    const id = normalizado.tweet.id;

    // Si el mismo tweet aparece como entrada del timeline Y como cita de otro,
    // manda la entrada: si en algun sitio era de columna, lo es.
    const anterior = tweets.get(id);
    const deColumna = esDeColumna || anterior?.esDeColumna === true;

    tweets.set(id, { ...normalizado.tweet, crudo, esDeColumna: deColumna });
    if (normalizado.autor) autores.set(normalizado.autor.id, normalizado.autor);
  }

  return { tweets: [...tweets.values()], autores: [...autores.values()] };
}

module.exports = { extraerTimeline, buscarTweetsCrudos };
