// Pinta un tweet. Devuelve un elemento del DOM.
//
// Nunca usamos innerHTML con texto que venga de X: siempre textContent.
// Ese texto lo escribe cualquiera en internet.

/** 1234 -> "1,2 mil" */
function formatearNumero(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace('.0', '')} mil`;
  return `${(n / 1000000).toFixed(1).replace('.0', '')} M`;
}

/** 1720000000000 -> "hace 3 h" */
function formatearFecha(ms) {
  const segundos = Math.floor((Date.now() - ms) / 1000);

  if (segundos < 60) return 'ahora';
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  if (segundos < 604800) return `hace ${Math.floor(segundos / 86400)} d`;

  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function crearMedia(media) {
  const contenedor = document.createElement('div');
  contenedor.className = 'tweet-media';

  for (const item of media.slice(0, 4)) {
    const img = document.createElement('img');
    img.src = item.url;
    img.loading = 'lazy';
    img.alt = item.tipo === 'photo' ? 'Imagen del tweet' : 'Miniatura del video';
    contenedor.appendChild(img);

    if (item.tipo !== 'photo') {
      const marca = document.createElement('span');
      marca.className = 'tweet-media-video';
      marca.textContent = 'Video';
      contenedor.appendChild(marca);
    }
  }

  return contenedor;
}

function crearMetricas(metricas) {
  const fila = document.createElement('div');
  fila.className = 'tweet-metricas';

  const items = [
    ['Respuestas', metricas.respuestas],
    ['RT', metricas.retweets],
    ['Likes', metricas.likes],
    ['Vistas', metricas.vistas],
  ];

  for (const [etiqueta, valor] of items) {
    const span = document.createElement('span');
    span.className = 'tweet-metrica';
    span.title = etiqueta;
    span.textContent = `${etiqueta[0]} ${formatearNumero(valor ?? 0)}`;
    span.setAttribute('aria-label', `${etiqueta}: ${formatearNumero(valor ?? 0)}`);
    fila.appendChild(span);
  }

  return fila;
}

/** Fila de acciones: guardar (estrella) y exportar el JSON. */
function crearAcciones(tweet, acciones) {
  const fila = document.createElement('div');
  fila.className = 'tweet-acciones';
  fila.setAttribute('aria-label', 'Acciones del post');

  // Estrella: guardar/quitar de guardados. Refleja el estado y lo cambia al vuelo.
  const estrella = document.createElement('button');
  estrella.type = 'button';
  estrella.className = 'tweet-accion';
  const pintarEstrella = (guardado) => {
    estrella.textContent = guardado ? '★' : '☆';
    estrella.title = guardado ? 'Quitar de guardados' : 'Guardar localmente';
    estrella.setAttribute('aria-label', estrella.title);
    estrella.setAttribute('aria-pressed', String(guardado));
    estrella.classList.toggle('activa', guardado);
  };
  let guardado = tweet.guardado;
  pintarEstrella(guardado);
  estrella.addEventListener('click', async (e) => {
    e.stopPropagation();
    const estadoAnterior = guardado;
    guardado = !estadoAnterior;
    pintarEstrella(guardado);
    estrella.disabled = true;
    try {
      await window.api.guardarTweet(tweet.id, guardado);
      if (acciones.alCambiarGuardado) acciones.alCambiarGuardado(tweet.id, guardado);
    } catch {
      guardado = estadoAnterior;
      pintarEstrella(guardado);
      estrella.title = 'No se pudo cambiar el estado de guardado';
      estrella.setAttribute('aria-label', estrella.title);
    } finally {
      estrella.disabled = false;
    }
  });
  fila.appendChild(estrella);

  // Abrir el tweet en la columna en vivo principal (para leer/responder en X).
  if (tweet.enlace) {
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'tweet-accion';
    abrir.textContent = '↗';
    abrir.title = 'Abrir en la columna en vivo';
    abrir.setAttribute('aria-label', abrir.title);
    abrir.addEventListener('click', (e) => {
      e.stopPropagation();
      if (acciones.alAbrir) acciones.alAbrir(tweet.enlace);
    });
    fila.appendChild(abrir);
  }

  // Exportar el JSON crudo original de X.
  const exportar = document.createElement('button');
  exportar.type = 'button';
  exportar.className = 'tweet-accion';
  exportar.textContent = '{ }';
  exportar.title = 'Exportar JSON del tweet';
  exportar.setAttribute('aria-label', exportar.title);
  exportar.addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = await window.api.exportarTweet(tweet.id);
    if (r && r.ok) exportar.title = 'Guardado en ' + r.ruta;
    else if (r && r.motivo) exportar.title = r.motivo;
    exportar.setAttribute('aria-label', exportar.title);
  });
  fila.appendChild(exportar);

  return fila;
}

/**
 * @param {object} tweet El objeto que devuelve tweetsDeColumna
 * @param {object} [acciones] Callbacks opcionales: alCambiarGuardado, alAbrir
 */
export function crearTweet(tweet, acciones = {}) {
  const articulo = document.createElement('article');
  articulo.className = 'tweet';

  const avatar = document.createElement('img');
  avatar.className = 'tweet-avatar';
  avatar.src = tweet.autor.avatarUrl;
  avatar.alt = `Avatar de ${tweet.autor.nombre}`;
  articulo.appendChild(avatar);

  const cuerpo = document.createElement('div');
  cuerpo.className = 'tweet-cuerpo';

  const cabecera = document.createElement('div');
  cabecera.className = 'tweet-cabecera';

  const nombre = document.createElement('strong');
  nombre.textContent = tweet.autor.nombre;
  cabecera.appendChild(nombre);

  if (tweet.autor.verificado) {
    const check = document.createElement('span');
    check.className = 'tweet-verificado';
    check.textContent = '✓';
    check.title = 'Verificado';
    cabecera.appendChild(check);
  }

  const handle = document.createElement('span');
  handle.className = 'tweet-handle';
  handle.textContent = `@${tweet.autor.handle}`;
  cabecera.appendChild(handle);

  const fecha = document.createElement('span');
  fecha.className = 'tweet-fecha';
  fecha.textContent = formatearFecha(tweet.creadoEn);
  fecha.title = new Date(tweet.creadoEn).toLocaleString('es-ES');
  cabecera.appendChild(fecha);

  cuerpo.appendChild(cabecera);

  const texto = document.createElement('p');
  texto.className = 'tweet-texto';
  texto.textContent = tweet.texto;
  cuerpo.appendChild(texto);

  if (tweet.media.length > 0) cuerpo.appendChild(crearMedia(tweet.media));

  cuerpo.appendChild(crearMetricas(tweet.metricas));
  cuerpo.appendChild(crearAcciones(tweet, acciones));

  articulo.appendChild(cuerpo);
  return articulo;
}
