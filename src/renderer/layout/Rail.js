// Rail vertical de espacios de trabajo (la columna de iconos de la izquierda).
//
// Sustituye al desplegable "Espacio" que había en la barra superior: cambiar de
// tablero es un gesto frecuente y merece estar siempre a un clic.
//
// Este módulo solo pinta y avisa; no sabe guardar nada. Quien lo llama decide
// qué hacer en cada callback.

import { crearIcono } from '../components/Icono.js';

/** "Seguimiento diario" -> "SD". Se usa cuando el espacio no tiene icono. */
function iniciales(nombre) {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/**
 * Un botón del rail: la barrita de activo, el cuadro con el icono o las
 * iniciales, y el nombre como tooltip.
 */
function crearItem({ etiqueta, icono, texto, activo, alPulsar }) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = activo ? 'rail-item rail-item--activo' : 'rail-item';
  boton.title = etiqueta;
  boton.setAttribute('aria-label', etiqueta);
  if (activo) boton.setAttribute('aria-current', 'true');

  const indicador = document.createElement('span');
  indicador.className = 'rail-indicador';
  indicador.setAttribute('aria-hidden', 'true');
  boton.appendChild(indicador);

  const cuadro = document.createElement('span');
  cuadro.className = 'rail-cuadro';
  const svg = icono ? crearIcono(icono, 16) : null;
  if (svg) cuadro.appendChild(svg);
  else cuadro.textContent = texto;
  boton.appendChild(cuadro);

  boton.addEventListener('click', alPulsar);
  return boton;
}

/**
 * Repinta el rail entero.
 *
 * @param {HTMLElement} contenedor El <nav> del rail
 * @param {object} opciones
 * @param {Array<{id: string, nombre: string, columnas: Array}>} opciones.espacios
 * @param {string|null} opciones.activo Id del espacio activo, o null para "todas"
 * @param {(id: string) => void} opciones.alSeleccionar
 * @param {() => void} opciones.alCrear
 * @param {() => void} opciones.alAbrirOpciones
 */
export function pintarRail(contenedor, opciones) {
  const { espacios, activo, alSeleccionar, alCrear, alAbrirOpciones } = opciones;
  contenedor.replaceChildren();

  const grupo = document.createElement('div');
  grupo.className = 'rail-grupo';

  grupo.appendChild(
    crearItem({
      etiqueta: 'Todas las columnas',
      icono: 'rejilla',
      activo: !activo,
      alPulsar: () => alSeleccionar(''),
    }),
  );

  for (const espacio of espacios) {
    grupo.appendChild(
      crearItem({
        etiqueta: `${espacio.nombre} · ${espacio.columnas.length} columnas`,
        texto: iniciales(espacio.nombre),
        activo: espacio.id === activo,
        alPulsar: () => alSeleccionar(espacio.id),
      }),
    );
  }

  contenedor.appendChild(grupo);

  const pie = document.createElement('div');
  pie.className = 'rail-pie';
  pie.appendChild(
    crearItem({ etiqueta: 'Crear espacio', icono: 'mas', activo: false, alPulsar: alCrear }),
  );
  pie.appendChild(
    crearItem({ etiqueta: 'Opciones', icono: 'ajustes', activo: false, alPulsar: alAbrirOpciones }),
  );
  contenedor.appendChild(pie);
}
