// Limpia lo que el usuario escribe en el campo "Fuente" de una columna.
//
// La idea es que puedas pegar la URL de X tal cual, sin tener que buscar el id
// de la lista ni quitarle la arroba al handle. Tambien acepta el valor pelado.
//
// Ejemplos que funcionan:
//   Perfil:   https://x.com/jack   |  @jack  |  jack
//   Lista:    https://x.com/i/lists/1234  |  1234
//   Busqueda: https://x.com/search?q=gatos&f=live  |  gatos lang:es

// Nombres que ocupan una ruta de X y por tanto no son handles de usuario.
const RUTAS_RESERVADAS = new Set([
  'home', 'explore', 'notifications', 'messages', 'settings',
  'search', 'i', 'compose', 'bookmarks', 'jobs', 'login',
]);

// X permite letras, numeros y guion bajo, hasta 15 caracteres.
const HANDLE_VALIDO = /^[A-Za-z0-9_]{1,15}$/;

/** ¿El texto parece una URL de x.com o twitter.com? */
function esUrlDeX(texto) {
  return /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(texto);
}

/** Devuelve las partes de la ruta: "https://x.com/i/lists/99?a=1" -> ['i','lists','99'] */
function partesDeRuta(url) {
  const { pathname } = new URL(url);
  return pathname.split('/').filter((parte) => parte !== '');
}

function normalizarUsuario(entrada) {
  let handle = entrada;

  if (esUrlDeX(entrada)) {
    const partes = partesDeRuta(entrada);
    if (partes.length === 0) throw new Error('Esa URL no apunta a ningún perfil.');
    if (partes[0] === 'i') throw new Error('Esa URL no es un perfil. ¿Querías una lista?');
    handle = partes[0];
  }

  handle = handle.replace(/^@/, '').trim();

  if (RUTAS_RESERVADAS.has(handle.toLowerCase())) {
    throw new Error(`"${handle}" no es un perfil, es una sección de X.`);
  }
  if (!HANDLE_VALIDO.test(handle)) {
    throw new Error(`"${handle}" no parece un nombre de usuario válido.`);
  }

  return handle;
}

function normalizarLista(entrada) {
  let id = entrada.trim();

  if (esUrlDeX(entrada)) {
    const partes = partesDeRuta(entrada);
    // La URL de una lista es /i/lists/<id>
    const indice = partes.indexOf('lists');
    if (indice === -1 || !partes[indice + 1]) {
      throw new Error('Esa URL no es de una lista. Debe ser .../i/lists/<número>');
    }
    id = partes[indice + 1];
  }

  if (!/^\d+$/.test(id)) {
    throw new Error('El id de una lista es solo números. Pega la URL completa si no lo sabes.');
  }

  return id;
}

function normalizarBusqueda(entrada) {
  let terminos = entrada.trim();

  if (esUrlDeX(entrada)) {
    const consulta = new URL(entrada).searchParams.get('q');
    if (!consulta) throw new Error('Esa URL de búsqueda no lleva términos (le falta ?q=).');
    terminos = consulta;
  }

  if (terminos === '') throw new Error('Escribe algo que buscar.');

  return terminos;
}

/**
 * Convierte lo que escribio el usuario en la fuente que guardamos en la base de datos.
 * Lanza un Error con un mensaje entendible si la entrada no vale.
 *
 * @param {string} tipo   'home' | 'notifications' | 'list' | 'user' | 'search'
 * @param {string} entrada Lo que escribio el usuario
 * @returns {string} La fuente limpia ('' para home y notifications)
 */
function normalizarFuente(tipo, entrada) {
  const texto = (entrada ?? '').trim();

  switch (tipo) {
    case 'home':
    case 'notifications':
    case 'saved':
      return ''; // no necesitan fuente
    case 'user':
      return normalizarUsuario(texto);
    case 'list':
      return normalizarLista(texto);
    case 'search':
      return normalizarBusqueda(texto);
    default:
      throw new Error(`Tipo de columna desconocido: ${tipo}`);
  }
}

module.exports = { normalizarFuente };
