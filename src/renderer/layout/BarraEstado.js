// Barra de estado inferior.
//
// Enseña de un vistazo lo que antes había que deducir mirando las columnas una
// a una: cuántas hay, cuándo fue la última captura, si la cosecha está viva y
// si hay sesión en X.
//
// Solo muestra datos que el renderer ya tiene. No pide nada por IPC.

import { crearIcono } from '../components/Icono.js';

/** 1720000000000 -> "12:41". Devuelve null si nunca se ha capturado nada. */
function formatearHora(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 12480 -> "12.480"
 *
 * No usamos toLocaleString('es-ES') porque el castellano no agrupa las cifras
 * de cuatro dígitos: dejaba "12.480 posts · 3104 autores" en la misma línea.
 * Aquí agrupamos siempre a partir del millar para que se lean igual.
 */
function formatearNumero(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Los items llevan una clase de prioridad para que el CSS sepa cuáles esconder
// primero cuando la ventana se estrecha: --extra antes que --opcional.
function crearItem(icono, texto, prioridad = '') {
  const item = document.createElement('span');
  item.className = prioridad ? `estado-item estado-item--${prioridad}` : 'estado-item';

  const svg = crearIcono(icono, 12);
  if (svg) item.appendChild(svg);

  const etiqueta = document.createElement('span');
  etiqueta.textContent = texto;
  item.appendChild(etiqueta);

  return item;
}

/**
 * Repinta la barra entera.
 *
 * @param {HTMLElement} contenedor El <footer> de la barra
 * @param {object} datos
 * @param {number} datos.columnas Cuántas columnas hay en el tablero
 * @param {number} datos.enVivo Cuántas de ellas son webviews
 * @param {number} datos.ultimaCaptura Marca de tiempo más reciente, o 0
 * @param {boolean} datos.cosechaPausada
 * @param {boolean} datos.sesionIniciada
 * @param {string} datos.espacio Nombre del espacio activo
 * @param {{tweets: number, autores: number}|null} [datos.biblioteca] Totales guardados
 * @param {{ramMb: number, ventanas: number}|null} [datos.sistema] Memoria y ventanas
 */
export function pintarBarraEstado(contenedor, datos) {
  contenedor.replaceChildren();

  const columnas =
    datos.enVivo > 0
      ? `${datos.columnas} columnas · ${datos.enVivo} en vivo`
      : `${datos.columnas} columnas`;
  contenedor.appendChild(crearItem('columnas', columnas));

  // Biblioteca y memoria pueden no haber llegado todavía: hasta entonces no se
  // pinta nada, mejor que enseñar un cero que es mentira.
  if (datos.biblioteca) {
    const { tweets, autores } = datos.biblioteca;
    contenedor.appendChild(
      crearItem(
        'baseDatos',
        `${formatearNumero(tweets)} posts · ${formatearNumero(autores)} autores`,
        'extra',
      ),
    );
  }

  const hora = formatearHora(datos.ultimaCaptura);
  contenedor.appendChild(
    crearItem('reloj', hora ? `Última captura ${hora}` : 'Sin capturas aún', 'opcional'),
  );

  contenedor.appendChild(
    crearItem(
      datos.cosechaPausada ? 'pausa' : 'actividad',
      datos.cosechaPausada ? 'Cosecha pausada' : 'Cosecha activa',
    ),
  );

  if (datos.sistema) {
    const { ramMb, ventanas } = datos.sistema;
    const plural = ventanas === 1 ? 'ventana' : 'ventanas';
    contenedor.appendChild(
      crearItem('memoria', `RAM ${formatearNumero(ramMb)} MB · ${ventanas} ${plural}`, 'extra'),
    );
  }

  const hueco = document.createElement('span');
  hueco.className = 'estado-hueco';
  contenedor.appendChild(hueco);

  contenedor.appendChild(crearItem('rejilla', datos.espacio));

  // La sesión va con el punto de color, igual que el visor de las columnas.
  const sesion = document.createElement('span');
  sesion.className = 'estado-item estado-item--sesion';
  const punto = document.createElement('span');
  punto.className = datos.sesionIniciada ? 'punto punto--ok' : 'punto punto--aviso';
  sesion.appendChild(punto);
  const texto = document.createElement('span');
  texto.textContent = datos.sesionIniciada ? 'Sesión activa en X' : 'Sin sesión en X';
  sesion.appendChild(texto);
  contenedor.appendChild(sesion);
}
