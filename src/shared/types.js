// Forma de los objetos que viajan entre capas. Solo documentacion (JSDoc), sin logica.

/**
 * @typedef {Object} Usuario
 * @property {string} id
 * @property {string} handle      Sin la arroba
 * @property {string} nombre
 * @property {string} avatarUrl
 * @property {boolean} verificado
 */

/**
 * @typedef {Object} Media
 * @property {'photo'|'video'|'animated_gif'} tipo
 * @property {string} url         Imagen o miniatura del video
 * @property {string} [videoUrl]  Solo si tipo != photo
 */

/**
 * @typedef {Object} Metricas
 * @property {number} likes
 * @property {number} retweets
 * @property {number} respuestas
 * @property {number} citas
 * @property {number} vistas
 */

/**
 * @typedef {Object} Tweet
 * @property {string} id
 * @property {string} autorId
 * @property {string} texto
 * @property {number} creadoEn      Milisegundos epoch
 * @property {string|null} respuestaA
 * @property {string|null} citaDe
 * @property {Metricas} metricas
 * @property {Media[]} media
 */

/**
 * @typedef {'list'|'search'|'user'|'home'|'notifications'} TipoColumna
 */

/**
 * @typedef {Object} Columna
 * @property {number} id
 * @property {string} titulo
 * @property {TipoColumna} tipo
 * @property {string} fuente      Id de lista, termino de busqueda, handle...
 * @property {number} posicion
 */

module.exports = {};
