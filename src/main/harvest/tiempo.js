// Ayudantes de tiempo para la cosecha.

const { AJUSTES } = require('../../../config/settings');

/**
 * Devuelve el tiempo con una variacion aleatoria.
 * conJitter(10000) -> un numero entre 6000 y 14000 (con JITTER = 0.4)
 *
 * Sirve para que nuestras peticiones no caigan en intervalos exactos, que es
 * la forma mas facil de que nos identifiquen como un robot.
 */
function conJitter(ms) {
  const variacion = ms * AJUSTES.JITTER;
  const desplazamiento = (Math.random() * 2 - 1) * variacion; // entre -variacion y +variacion
  return Math.max(0, Math.round(ms + desplazamiento));
}

/** Espera los milisegundos indicados. */
function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { conJitter, esperar };
