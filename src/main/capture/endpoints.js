// ARCHIVO FRAGIL: aqui vive todo lo que sabemos sobre las URLs internas de X.
// Si X cambia sus endpoints, este archivo es el primero que hay que revisar.
//
// Las peticiones tienen la forma:
//   https://x.com/i/api/graphql/<hash>/<NombreDeOperacion>?variables=...
// El <hash> cambia con cada despliegue de X, el NombreDeOperacion es mucho mas estable.

const PREFIJO_GRAPHQL = '/i/api/graphql/';

// Operaciones que devuelven listas de tweets y que nos interesa guardar.
const OPERACIONES_DE_TIMELINE = new Set([
  'HomeTimeline',
  'HomeLatestTimeline',
  'ListLatestTweetsTimeline',
  'SearchTimeline',
  'UserTweets',
  'UserTweetsAndReplies',
  'UserMedia',
  'TweetDetail',
  'Bookmarks',
  'CommunityTweetsTimeline',
  'NotificationsTimeline',
]);

/** ¿Esta URL es una llamada a la API GraphQL de X? */
function esLlamadaGraphQL(url) {
  return url.includes(PREFIJO_GRAPHQL);
}

/**
 * Saca el nombre de la operacion de la URL.
 * @returns {string|null} Ej: 'ListLatestTweetsTimeline'
 */
function nombreDeOperacion(url) {
  if (!esLlamadaGraphQL(url)) return null;

  const desdePrefijo = url.split(PREFIJO_GRAPHQL)[1];
  if (!desdePrefijo) return null;

  // desdePrefijo = "<hash>/<Operacion>?variables=..."
  const partes = desdePrefijo.split('?')[0].split('/');
  return partes[1] ?? null;
}

/** ¿Vale la pena parsear esta respuesta buscando tweets? */
function esTimeline(url) {
  const operacion = nombreDeOperacion(url);

  if (!operacion) return false;
  if (OPERACIONES_DE_TIMELINE.has(operacion)) return true;

  // Red de seguridad: si X renombra una operacion pero mantiene "Timeline"
  // en el nombre, la aceptamos igual en vez de perder los datos en silencio.
  return operacion.includes('Timeline');
}

// Operaciones que devuelven las listas del usuario. La conocida es
// ListsManagementPageTimeline (la pagina /i/lists). No la fijamos: cualquier
// operacion cuyo nombre contenga "List" puede traer listas, y las detectamos
// tambien por contenido en el parser.
function esOperacionDeListas(url) {
  const operacion = nombreDeOperacion(url);
  if (!operacion) return false;
  // "List" pero no un timeline de tweets de una lista (esos ya son timeline).
  return operacion.includes('List');
}

module.exports = {
  esLlamadaGraphQL,
  nombreDeOperacion,
  esTimeline,
  esOperacionDeListas,
  OPERACIONES_DE_TIMELINE,
};
