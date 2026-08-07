// Arranque de la interfaz.

import { Tablero } from './layout/Board.js';
import { actualizarEstado } from './state/store.js';

const contenedor = document.getElementById('tablero');
const toast = document.getElementById('toast');
const toastTexto = document.getElementById('toast-texto');
const toastDeshacer = document.getElementById('toast-deshacer');
let temporizadorToast = null;
let ajustesActuales = null;

function ocultarDeshacer() {
  if (temporizadorToast) clearTimeout(temporizadorToast);
  temporizadorToast = null;
  toast.hidden = true;
  toastDeshacer.hidden = true;
  toastDeshacer.onclick = null;
}

function mostrarDeshacer({ mensaje, alDeshacer }) {
  ocultarDeshacer();
  toastTexto.textContent = mensaje;
  toastDeshacer.hidden = false;
  toastDeshacer.onclick = () => {
    alDeshacer();
    ocultarDeshacer();
  };
  toast.hidden = false;
  temporizadorToast = setTimeout(ocultarDeshacer, 8000);
}

function mostrarMensaje(mensaje, duracion = 3500) {
  // Un aviso informativo nunca debe robar la unica oportunidad de deshacer una
  // eliminacion que todavia esta dentro de su ventana de seguridad.
  if (!toastDeshacer.hidden) return;
  ocultarDeshacer();
  toastTexto.textContent = mensaje;
  toast.hidden = false;
  temporizadorToast = setTimeout(ocultarDeshacer, duracion);
}

async function recargarColumnas() {
  if (tablero.columnas.size === 0) tablero.mostrarEstado('cargando');

  try {
    const columnas = await window.api.listarColumnas();
    actualizarEstado({ columnas, cargando: false, error: null });
    await tablero.sincronizar(columnas);
  } catch (error) {
    const mensaje = mensajeLimpio(error);
    actualizarEstado({ cargando: false, error: mensaje });
    tablero.mostrarEstado('error', mensaje);
    console.error('[ui] no se pudieron cargar las columnas:', error);
  }
}

const tablero = new Tablero(contenedor, recargarColumnas, {
  mostrarDeshacer,
  ocultarDeshacer,
  mostrarMensaje,
  alActualizarEspacio: (espacio) => actualizarEspacioDesdeTablero(espacio),
  alEliminarColumna: (id) => eliminarColumnaDeEspacios(id),
});

// Al final del archivo se llama a arrancar(), que ademas comprueba la sesion.

// --- Barra superior ---

const menuMas = document.getElementById('menu-mas');
const barraHerramientas = document.getElementById('barra-herramientas');
const btnMostrarBarra = document.getElementById('btn-mostrar-barra');
const btnOcultarBarra = document.getElementById('btn-ocultar-barra');

function cerrarMenuMas() {
  menuMas.open = false;
}

function aplicarVisibilidadBarra(mostrar) {
  barraHerramientas.hidden = !mostrar;
  btnMostrarBarra.hidden = mostrar;
  if (!mostrar) cerrarMenuMas();
}

async function guardarVisibilidadBarra(mostrar) {
  aplicarVisibilidadBarra(mostrar);
  try {
    await window.api.guardarAjustes({ mostrarBarraHerramientas: mostrar });
  } catch (error) {
    aplicarVisibilidadBarra(!mostrar);
    console.error('[ui] no se pudo guardar la visibilidad de la barra:', error);
  }
}

btnOcultarBarra.addEventListener('click', () => guardarVisibilidadBarra(false));
btnMostrarBarra.addEventListener('click', () => guardarVisibilidadBarra(true));

// --- Cabeceras de columna plegadas ---
//
// Plegar deja solo una franja fina arriba de cada columna. La cabecera vuelve a
// aparecer flotando cuando pasas el raton por esa franja, asi que el contenido
// no cambia de tamano y las webviews no tienen que redimensionarse.

const btnPlegarCabeceras = document.getElementById('btn-plegar-cabeceras');
let cabecerasPlegadas = false;

function aplicarPlegadoCabeceras(plegadas) {
  cabecerasPlegadas = plegadas === true;
  document.body.dataset.cabeceras = cabecerasPlegadas ? 'plegadas' : 'normales';
  btnPlegarCabeceras.querySelector('.menu-accion-titulo').textContent = cabecerasPlegadas
    ? 'Desplegar cabeceras'
    : 'Plegar cabeceras';
  btnPlegarCabeceras.querySelector('.menu-accion-pista').textContent = cabecerasPlegadas
    ? 'Vuelve a mostrar el título y los botones de cada columna'
    : 'Deja una franja fina; vuelven al pasar el ratón por encima';
}

async function guardarPlegadoCabeceras(plegadas) {
  aplicarPlegadoCabeceras(plegadas);
  try {
    await window.api.guardarAjustes({ cabecerasPlegadas: plegadas });
  } catch (error) {
    aplicarPlegadoCabeceras(!plegadas);
    console.error('[ui] no se pudo guardar el plegado de cabeceras:', error);
  }
}

btnPlegarCabeceras.addEventListener('click', () => {
  cerrarMenuMas();
  guardarPlegadoCabeceras(!cabecerasPlegadas);
});

document.getElementById('btn-abrir-x').addEventListener('click', () => {
  cerrarMenuMas();
  window.api.abrirX();
});

document.getElementById('btn-refrescar').addEventListener('click', async (evento) => {
  const boton = evento.currentTarget;
  const etiqueta = boton.querySelector('.boton-etiqueta');
  const textoOriginal = etiqueta.textContent;
  boton.disabled = true;
  boton.setAttribute('aria-label', 'Actualizando columnas');
  etiqueta.textContent = 'Actualizando…';
  try {
    await tablero.refrescarTodas();
  } finally {
    etiqueta.textContent = textoOriginal;
    boton.setAttribute('aria-label', 'Refrescar columnas');
    boton.disabled = false;
  }
});

const btnPausarCosecha = document.getElementById('btn-pausar-cosecha');
let cosechaPausada = false;

function pintarPausaCosecha() {
  btnPausarCosecha.classList.toggle('activa', cosechaPausada);
  btnPausarCosecha.querySelector('.boton-icono').textContent = cosechaPausada ? '▶' : 'Ⅱ';
  btnPausarCosecha.querySelector('.boton-etiqueta').textContent = cosechaPausada ? 'Reanudar' : 'Pausar';
  btnPausarCosecha.title = cosechaPausada
    ? 'Reanudar la cosecha de columnas'
    : 'Pausar la cosecha y liberar sus ventanas ocultas';
  btnPausarCosecha.setAttribute('aria-label', btnPausarCosecha.title);
  tablero.setCosechaPausada(cosechaPausada);
}

async function cambiarPausaCosecha(pausada = !cosechaPausada) {
  btnPausarCosecha.disabled = true;
  try {
    const resultado = await window.api.pausarCosecha(pausada);
    cosechaPausada = resultado.pausada;
    if (ajustesActuales) ajustesActuales.cosechaPausada = cosechaPausada;
    pintarPausaCosecha();
    mostrarMensaje(cosechaPausada ? 'Cosecha pausada; ventanas ocultas cerradas' : 'Cosecha reanudada');
  } catch (error) {
    mostrarMensaje(mensajeLimpio(error));
  } finally {
    btnPausarCosecha.disabled = false;
  }
}

btnPausarCosecha.addEventListener('click', () => cambiarPausaCosecha());

document.addEventListener('click', (evento) => {
  if (menuMas.open && !menuMas.contains(evento.target)) cerrarMenuMas();
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && menuMas.open) {
    cerrarMenuMas();
    menuMas.querySelector('summary').focus();
  }
});

// --- Espacios de trabajo, importacion y paleta de comandos ---

const selectorEspacio = document.getElementById('selector-espacio');
const listaEspacios = document.getElementById('lista-espacios');
const dialogoGuardarEspacioActual = document.getElementById('dialogo-guardar-espacio-actual');
const formularioGuardarEspacioActual = document.getElementById('form-guardar-espacio-actual');
const campoNombreEspacioActual = document.getElementById('campo-nombre-espacio-actual');
const errorEspacioActual = document.getElementById('error-espacio-actual');
const btnConfirmarEspacioActual = document.getElementById('btn-confirmar-espacio-actual');
const dialogoEspacio = document.getElementById('dialogo-espacio');
const formularioEspacio = document.getElementById('form-espacio');
const campoNombreEspacio = document.getElementById('campo-nombre-espacio');
const tituloDialogoEspacio = document.getElementById('titulo-dialogo-espacio');
const textoDialogoEspacio = document.getElementById('texto-dialogo-espacio');
const columnasEspacio = document.getElementById('columnas-espacio');
const columnasEspacioVacias = document.getElementById('columnas-espacio-vacias');
const selectorColumnaExistente = document.getElementById('selector-columna-existente');
const errorEspacio = document.getElementById('error-espacio');
const btnGuardarEditorEspacio = document.getElementById('btn-guardar-editor-espacio');
let espacioEditandoId = null;
let borradoresColumnasEspacio = [];
let contadorBorradores = 0;
let listasEditorEspacio = [];

const TIPOS_EDITOR_ESPACIO = [
  ['home', 'Inicio'],
  ['notifications', 'Notificaciones'],
  ['list', 'Lista'],
  ['user', 'Perfil'],
  ['search', 'Búsqueda'],
  ['saved', 'Guardados locales'],
];

const ORDENES_BUSQUEDA_EDITOR = [
  ['live', 'Más recientes'],
  ['top', 'Destacados'],
  ['user', 'Personas'],
  ['media', 'Multimedia'],
];

async function guardarAjustesUi(parcial) {
  ajustesActuales = await window.api.guardarAjustes(parcial);
  return ajustesActuales;
}

function espacioActivo() {
  return ajustesActuales?.espaciosTrabajo?.find((e) => e.id === ajustesActuales.espacioActivo) ?? null;
}

function pintarEspacios() {
  const espacios = ajustesActuales?.espaciosTrabajo ?? [];
  selectorEspacio.replaceChildren(new Option('Todas las columnas', ''));
  listaEspacios.replaceChildren();

  for (const espacio of espacios) {
    selectorEspacio.appendChild(new Option(espacio.nombre, espacio.id));

    const fila = document.createElement('div');
    fila.className = 'espacio-item';
    const nombre = document.createElement('span');
    nombre.textContent = `${espacio.nombre} · ${espacio.columnas.length}`;
    fila.appendChild(nombre);

    const acciones = document.createElement('span');
    acciones.className = 'espacio-item-acciones';
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'espacio-editar';
    editar.textContent = 'Editar';
    editar.title = `Editar espacio ${espacio.nombre}`;
    editar.addEventListener('click', () => {
      abrirDialogoEspacio(espacio.id).catch((error) => mostrarMensaje(mensajeLimpio(error)));
    });
    acciones.appendChild(editar);

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'espacio-borrar';
    borrar.textContent = '×';
    borrar.title = `Eliminar espacio ${espacio.nombre}`;
    borrar.setAttribute('aria-label', borrar.title);
    borrar.addEventListener('click', () => borrarEspacio(espacio.id));
    acciones.appendChild(borrar);
    fila.appendChild(acciones);
    listaEspacios.appendChild(fila);
  }

  selectorEspacio.value = ajustesActuales?.espacioActivo ?? '';
  tablero.setEspacioTrabajo(espacioActivo());
}

async function seleccionarEspacio(id) {
  await guardarAjustesUi({ espacioActivo: id || null });
  pintarEspacios();
}

selectorEspacio.addEventListener('change', () => {
  seleccionarEspacio(selectorEspacio.value).catch((error) => mostrarMensaje(mensajeLimpio(error)));
});

function abrirDialogoGuardarEspacioActual() {
  cerrarMenuMas();
  formularioGuardarEspacioActual.reset();
  errorEspacioActual.hidden = true;
  const activo = espacioActivo();
  campoNombreEspacioActual.value = activo ? `${activo.nombre} · copia` : '';
  dialogoGuardarEspacioActual.showModal();
  requestAnimationFrame(() => campoNombreEspacioActual.focus());
}

document
  .getElementById('btn-guardar-espacio-actual')
  .addEventListener('click', abrirDialogoGuardarEspacioActual);
document
  .getElementById('btn-cancelar-espacio-actual')
  .addEventListener('click', () => dialogoGuardarEspacioActual.close());

formularioGuardarEspacioActual.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nombre = campoNombreEspacioActual.value.trim();
  const columnas = tablero.idsVisibles();
  errorEspacioActual.hidden = true;

  if (!nombre) return;
  if (columnas.length === 0) {
    errorEspacioActual.textContent = 'No hay columnas visibles que guardar.';
    errorEspacioActual.hidden = false;
    return;
  }

  btnConfirmarEspacioActual.disabled = true;
  btnConfirmarEspacioActual.textContent = 'Guardando…';
  try {
    const nuevo = {
      id: `espacio-${Date.now().toString(36)}`,
      nombre,
      columnas: [...columnas],
    };
    const espaciosTrabajo = [...(ajustesActuales?.espaciosTrabajo ?? []), nuevo];
    await guardarAjustesUi({ espaciosTrabajo, espacioActivo: nuevo.id });
    formularioGuardarEspacioActual.reset();
    dialogoGuardarEspacioActual.close();
    pintarEspacios();
    mostrarMensaje(`Copia “${nombre}” guardada`);
  } catch (error) {
    errorEspacioActual.textContent = mensajeLimpio(error);
    errorEspacioActual.hidden = false;
  } finally {
    btnConfirmarEspacioActual.disabled = false;
    btnConfirmarEspacioActual.textContent = 'Guardar copia';
  }
});

function columnaDisponible(id) {
  return tablero.columnas.get(Number(id))?.columna ?? null;
}

function borradorDesdeColumna(columna) {
  return {
    clave: `existente-${columna.id}`,
    id: columna.id,
    titulo: columna.titulo,
    tipo: columna.tipo,
    fuente: columna.fuente ?? '',
    vivo: columna.vivo === true,
    filtros: { ...(columna.filtros ?? {}) },
  };
}

function nuevoBorradorColumna() {
  contadorBorradores += 1;
  return {
    clave: `nueva-${Date.now().toString(36)}-${contadorBorradores}`,
    id: null,
    titulo: 'Nueva columna',
    tipo: 'home',
    fuente: '',
    vivo: false,
    filtros: {},
  };
}

function actualizarSelectorColumnasExistentes() {
  const seleccionadas = new Set(
    borradoresColumnasEspacio
      .map((borrador) => borrador.id)
      .filter((id) => Number.isSafeInteger(id)),
  );
  selectorColumnaExistente.replaceChildren();

  for (const id of tablero.orden) {
    const columna = columnaDisponible(id);
    if (!columna || seleccionadas.has(id)) continue;
    selectorColumnaExistente.appendChild(
      new Option(`${columna.titulo} · ${columna.tipo}`, String(id)),
    );
  }

  const hayDisponibles = selectorColumnaExistente.options.length > 0;
  selectorColumnaExistente.disabled = !hayDisponibles;
  document.getElementById('btn-anadir-columna-existente').disabled = !hayDisponibles;
  if (!hayDisponibles) {
    selectorColumnaExistente.appendChild(new Option('No quedan columnas disponibles', ''));
  }
}

function moverColumnaEspacio(indice, cambio) {
  const destino = indice + cambio;
  if (destino < 0 || destino >= borradoresColumnasEspacio.length) return;
  const [movida] = borradoresColumnasEspacio.splice(indice, 1);
  borradoresColumnasEspacio.splice(destino, 0, movida);
  pintarEditorColumnasEspacio();
}

function pintarEditorColumnasEspacio() {
  columnasEspacio.replaceChildren();
  columnasEspacioVacias.hidden = borradoresColumnasEspacio.length > 0;

  borradoresColumnasEspacio.forEach((borrador, indice) => {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'columna-espacio-editor';

    const cabecera = document.createElement('header');
    const identidad = document.createElement('span');
    identidad.className = 'columna-espacio-identidad';
    identidad.textContent = borrador.id
      ? `${indice + 1}. Columna existente`
      : `${indice + 1}. Columna nueva`;
    cabecera.appendChild(identidad);

    const acciones = document.createElement('span');
    acciones.className = 'columna-espacio-acciones';
    const arriba = document.createElement('button');
    arriba.type = 'button';
    arriba.textContent = '↑';
    arriba.title = 'Mover hacia arriba';
    arriba.setAttribute('aria-label', arriba.title);
    arriba.disabled = indice === 0;
    arriba.addEventListener('click', () => moverColumnaEspacio(indice, -1));
    acciones.appendChild(arriba);

    const abajo = document.createElement('button');
    abajo.type = 'button';
    abajo.textContent = '↓';
    abajo.title = 'Mover hacia abajo';
    abajo.setAttribute('aria-label', abajo.title);
    abajo.disabled = indice === borradoresColumnasEspacio.length - 1;
    abajo.addEventListener('click', () => moverColumnaEspacio(indice, 1));
    acciones.appendChild(abajo);

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.textContent = '×';
    quitar.title = 'Quitar del espacio';
    quitar.setAttribute('aria-label', quitar.title);
    quitar.addEventListener('click', () => {
      borradoresColumnasEspacio.splice(indice, 1);
      pintarEditorColumnasEspacio();
    });
    acciones.appendChild(quitar);
    cabecera.appendChild(acciones);
    tarjeta.appendChild(cabecera);

    const campos = document.createElement('div');
    campos.className = 'columna-espacio-campos';

    const etiquetaTitulo = document.createElement('label');
    etiquetaTitulo.textContent = 'Título';
    const campoTitulo = document.createElement('input');
    campoTitulo.type = 'text';
    campoTitulo.maxLength = 100;
    campoTitulo.required = true;
    campoTitulo.value = borrador.titulo;
    campoTitulo.addEventListener('input', () => {
      borrador.titulo = campoTitulo.value;
    });
    etiquetaTitulo.appendChild(campoTitulo);
    campos.appendChild(etiquetaTitulo);

    const etiquetaTipo = document.createElement('label');
    etiquetaTipo.textContent = 'Contenido';
    const campoTipo = document.createElement('select');
    for (const [valor, nombre] of TIPOS_EDITOR_ESPACIO) {
      campoTipo.appendChild(new Option(nombre, valor));
    }
    campoTipo.value = borrador.tipo;
    etiquetaTipo.appendChild(campoTipo);
    campos.appendChild(etiquetaTipo);

    const etiquetaFuente = document.createElement('label');
    etiquetaFuente.className = 'columna-espacio-fuente';
    etiquetaFuente.textContent = 'Fuente';
    const campoFuenteEditor = document.createElement('input');
    campoFuenteEditor.type = 'text';
    campoFuenteEditor.value = borrador.fuente;
    campoFuenteEditor.addEventListener('input', () => {
      borrador.fuente = campoFuenteEditor.value;
    });

    const selectorListaEditor = document.createElement('select');
    selectorListaEditor.setAttribute('aria-label', 'Lista de X');
    const idsListas = new Set();
    for (const lista of listasEditorEspacio) {
      const idLista = String(lista.id);
      idsListas.add(idLista);
      const privacidad = lista.modo === 'private' ? ' · privada' : '';
      const miembros = Number.isFinite(Number(lista.miembros)) ? ` · ${lista.miembros} miembros` : '';
      selectorListaEditor.appendChild(
        new Option(`${lista.nombre}${privacidad}${miembros}`, idLista),
      );
    }
    if (
      borrador.tipo === 'list' &&
      borrador.fuente &&
      !idsListas.has(String(borrador.fuente))
    ) {
      selectorListaEditor.appendChild(
        new Option(`Lista guardada · ${borrador.fuente}`, String(borrador.fuente)),
      );
    }
    if (selectorListaEditor.options.length === 0) {
      selectorListaEditor.appendChild(new Option('No hay listas capturadas', ''));
      selectorListaEditor.disabled = true;
    }
    selectorListaEditor.value = String(borrador.fuente ?? '');
    selectorListaEditor.addEventListener('change', () => {
      borrador.fuente = selectorListaEditor.value;
    });

    etiquetaFuente.append(campoFuenteEditor, selectorListaEditor);
    campos.appendChild(etiquetaFuente);

    const etiquetaOrden = document.createElement('label');
    etiquetaOrden.className = 'columna-espacio-orden';
    etiquetaOrden.textContent = 'Orden de búsqueda';
    const campoOrdenEditor = document.createElement('select');
    for (const [valor, nombre] of ORDENES_BUSQUEDA_EDITOR) {
      campoOrdenEditor.appendChild(new Option(nombre, valor));
    }
    campoOrdenEditor.value = borrador.filtros?.orden ?? 'live';
    campoOrdenEditor.addEventListener('change', () => {
      borrador.filtros = { ...borrador.filtros, orden: campoOrdenEditor.value };
    });
    etiquetaOrden.appendChild(campoOrdenEditor);
    campos.appendChild(etiquetaOrden);

    const etiquetaVivo = document.createElement('label');
    etiquetaVivo.className = 'checkbox columna-espacio-vivo';
    const campoVivoEditor = document.createElement('input');
    campoVivoEditor.type = 'checkbox';
    campoVivoEditor.checked = borrador.vivo === true;
    campoVivoEditor.addEventListener('change', () => {
      borrador.vivo = campoVivoEditor.checked;
    });
    const textoVivo = document.createElement('span');
    textoVivo.textContent = 'Mostrar en vivo';
    etiquetaVivo.append(campoVivoEditor, textoVivo);
    campos.appendChild(etiquetaVivo);

    const refrescarTipo = () => {
      borrador.tipo = campoTipo.value;
      const necesitaFuente = ['list', 'user', 'search'].includes(borrador.tipo);
      const esLista = borrador.tipo === 'list';
      etiquetaFuente.hidden = !necesitaFuente;
      campoFuenteEditor.hidden = esLista;
      campoFuenteEditor.required = necesitaFuente && !esLista;
      selectorListaEditor.hidden = !esLista;
      selectorListaEditor.required = esLista;
      etiquetaOrden.hidden = borrador.tipo !== 'search';
      etiquetaVivo.hidden = borrador.tipo === 'saved';
      if (esLista && !selectorListaEditor.disabled) {
        const opcionActual = [...selectorListaEditor.options].some(
          (opcion) => opcion.value === String(borrador.fuente),
        );
        if (!opcionActual) {
          selectorListaEditor.selectedIndex = 0;
          borrador.fuente = selectorListaEditor.value;
        } else {
          selectorListaEditor.value = String(borrador.fuente);
        }
      }
      if (borrador.tipo === 'saved') {
        campoVivoEditor.checked = false;
        borrador.vivo = false;
      }
      campoFuenteEditor.placeholder = {
        list: 'URL o ID de la lista',
        user: '@usuario o URL del perfil',
        search: 'Términos de búsqueda',
      }[borrador.tipo] ?? '';
    };
    campoTipo.addEventListener('change', refrescarTipo);
    refrescarTipo();

    tarjeta.appendChild(campos);
    columnasEspacio.appendChild(tarjeta);
  });

  actualizarSelectorColumnasExistentes();
}

async function abrirDialogoEspacio(id = null) {
  cerrarMenuMas();
  if (document.getElementById('dialogo-opciones').open) document.getElementById('dialogo-opciones').close();
  formularioEspacio.reset();
  errorEspacio.hidden = true;
  espacioEditandoId = id;
  try {
    listasEditorEspacio = await window.api.listarListas();
  } catch {
    listasEditorEspacio = [];
  }

  const espacio = id
    ? ajustesActuales?.espaciosTrabajo?.find((item) => item.id === id)
    : null;
  tituloDialogoEspacio.textContent = espacio ? 'Editar espacio' : 'Crear espacio';
  textoDialogoEspacio.textContent = espacio
    ? 'Ajusta sus columnas, fuentes y orden. Los cambios quedan guardados localmente.'
    : 'Elige qué columnas contiene, configura sus fuentes y ordénalas.';
  btnGuardarEditorEspacio.textContent = espacio ? 'Guardar cambios' : 'Crear espacio';
  campoNombreEspacio.value = espacio?.nombre ?? '';

  // Crear empieza vacío a propósito. Para copiar lo que ya está en pantalla
  // existe la acción separada "Guardar espacio actual".
  const idsIniciales = espacio?.columnas ?? [];
  borradoresColumnasEspacio = idsIniciales
    .map((columnaId) => columnaDisponible(columnaId))
    .filter(Boolean)
    .map(borradorDesdeColumna);
  pintarEditorColumnasEspacio();

  dialogoEspacio.showModal();
  requestAnimationFrame(() => campoNombreEspacio.focus());
}

document.getElementById('btn-crear-espacio').addEventListener('click', () => {
  abrirDialogoEspacio().catch((error) => mostrarMensaje(mensajeLimpio(error)));
});
document.getElementById('btn-nuevo-espacio-opciones').addEventListener('click', () => {
  abrirDialogoEspacio().catch((error) => mostrarMensaje(mensajeLimpio(error)));
});
document.getElementById('btn-cancelar-espacio').addEventListener('click', () => dialogoEspacio.close());
document.getElementById('btn-actualizar-listas-espacio').addEventListener('click', async (evento) => {
  const boton = evento.currentTarget;
  boton.disabled = true;
  boton.textContent = 'Actualizando…';
  try {
    listasEditorEspacio = await window.api.refrescarListas();
    pintarEditorColumnasEspacio();
  } catch (error) {
    errorEspacio.textContent = mensajeLimpio(error);
    errorEspacio.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Actualizar listas';
  }
});
document.getElementById('btn-nueva-columna-espacio').addEventListener('click', () => {
  borradoresColumnasEspacio.push(nuevoBorradorColumna());
  pintarEditorColumnasEspacio();
});
document.getElementById('btn-anadir-columna-existente').addEventListener('click', () => {
  const columna = columnaDisponible(selectorColumnaExistente.value);
  if (!columna) return;
  borradoresColumnasEspacio.push(borradorDesdeColumna(columna));
  pintarEditorColumnasEspacio();
});

formularioEspacio.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nombre = campoNombreEspacio.value.trim();
  errorEspacio.hidden = true;
  if (!nombre) {
    campoNombreEspacio.focus();
    return;
  }
  if (borradoresColumnasEspacio.length === 0) {
    errorEspacio.textContent = 'Añade al menos una columna al espacio.';
    errorEspacio.hidden = false;
    return;
  }

  btnGuardarEditorEspacio.disabled = true;
  btnGuardarEditorEspacio.textContent = 'Guardando…';
  try {
    const resultado = await window.api.guardarColumnasLote(
      borradoresColumnasEspacio.map((borrador) => ({
        clave: borrador.clave,
        id: borrador.id,
        titulo: borrador.titulo.trim(),
        tipo: borrador.tipo,
        fuente: borrador.fuente.trim(),
        vivo: borrador.vivo,
        filtros: borrador.filtros,
      })),
    );
    const idsPorClave = new Map(resultado.map((item) => [item.clave, item.id]));
    const idEspacio = espacioEditandoId ?? `espacio-${Date.now().toString(36)}`;
    const guardado = {
      id: idEspacio,
      nombre,
      columnas: borradoresColumnasEspacio.map((borrador) => idsPorClave.get(borrador.clave)),
    };
    const anteriores = ajustesActuales?.espaciosTrabajo ?? [];
    const espaciosTrabajo = espacioEditandoId
      ? anteriores.map((espacio) => espacio.id === espacioEditandoId ? guardado : espacio)
      : [...anteriores, guardado];

    await guardarAjustesUi({ espaciosTrabajo, espacioActivo: idEspacio });
    tablero.setEspacioTrabajo(guardado);
    tablero.reiniciar();
    await recargarColumnas();

    formularioEspacio.reset();
    dialogoEspacio.close();
    pintarEspacios();
    mostrarMensaje(`Espacio “${nombre}” guardado`);
  } catch (error) {
    errorEspacio.textContent = mensajeLimpio(error);
    errorEspacio.hidden = false;
  } finally {
    btnGuardarEditorEspacio.disabled = false;
    btnGuardarEditorEspacio.textContent = espacioEditandoId ? 'Guardar cambios' : 'Crear espacio';
  }
});

async function borrarEspacio(id) {
  const espaciosTrabajo = (ajustesActuales?.espaciosTrabajo ?? []).filter((e) => e.id !== id);
  const activo = ajustesActuales?.espacioActivo === id ? null : ajustesActuales?.espacioActivo;
  await guardarAjustesUi({ espaciosTrabajo, espacioActivo: activo });
  pintarEspacios();
}

function actualizarEspacioDesdeTablero(espacioActualizado) {
  if (!ajustesActuales) return;
  const espaciosTrabajo = ajustesActuales.espaciosTrabajo.map((espacio) =>
    espacio.id === espacioActualizado.id ? espacioActualizado : espacio,
  );
  guardarAjustesUi({ espaciosTrabajo }).then(pintarEspacios).catch(console.error);
}

function eliminarColumnaDeEspacios(id) {
  if (!ajustesActuales) return;
  const espaciosTrabajo = ajustesActuales.espaciosTrabajo.map((espacio) => ({
    ...espacio,
    columnas: espacio.columnas.filter((columnaId) => columnaId !== id),
  }));
  guardarAjustesUi({ espaciosTrabajo }).then(pintarEspacios).catch(console.error);
}

async function exportarConfiguracion() {
  cerrarMenuMas();
  try {
    const resultado = await window.api.exportarConfiguracion();
    if (resultado?.ok) mostrarMensaje(`Configuración guardada en ${resultado.ruta}`, 5000);
  } catch (error) {
    mostrarMensaje(mensajeLimpio(error), 5000);
  }
}

async function importarConfiguracion() {
  cerrarMenuMas();
  try {
    const resultado = await window.api.importarConfiguracion();
    if (!resultado?.ok) return;
    ocultarDeshacer();
    await aplicarAjustes(resultado.ajustes);
    tablero.reiniciar();
    await recargarColumnas();
    mostrarMensaje('Configuración importada correctamente');
  } catch (error) {
    mostrarMensaje(mensajeLimpio(error), 5000);
  }
}

document.getElementById('btn-exportar-config').addEventListener('click', exportarConfiguracion);
document.getElementById('btn-importar-config').addEventListener('click', importarConfiguracion);

const dialogoPaleta = document.getElementById('dialogo-paleta');
const campoPaleta = document.getElementById('campo-paleta');
const listaPaleta = document.getElementById('lista-paleta');
let comandosFiltrados = [];
let comandoActivo = 0;

function textoComparable(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function comandosDisponibles() {
  const comandos = [
    { titulo: 'Nueva columna', grupo: 'Acción', ejecutar: abrirDialogoColumna },
    { titulo: 'Refrescar todas las columnas', grupo: 'Acción', ejecutar: () => document.getElementById('btn-refrescar').click() },
    { titulo: cosechaPausada ? 'Reanudar cosecha' : 'Pausar cosecha', grupo: 'Rendimiento', ejecutar: () => cambiarPausaCosecha() },
    { titulo: barraHerramientas.hidden ? 'Mostrar barra de herramientas' : 'Ocultar barra de herramientas', grupo: 'Vista', ejecutar: () => guardarVisibilidadBarra(barraHerramientas.hidden) },
    { titulo: cabecerasPlegadas ? 'Desplegar cabeceras de columna' : 'Plegar cabeceras de columna', grupo: 'Vista', ejecutar: () => guardarPlegadoCabeceras(!cabecerasPlegadas) },
    { titulo: 'Abrir opciones', grupo: 'Acción', ejecutar: abrirDialogoOpciones },
    { titulo: 'Guardar espacio actual', grupo: 'Espacios', ejecutar: abrirDialogoGuardarEspacioActual },
    {
      titulo: 'Crear espacio',
      grupo: 'Espacios',
      ejecutar: () => abrirDialogoEspacio().catch((error) => mostrarMensaje(mensajeLimpio(error))),
    },
    { titulo: 'Exportar configuración', grupo: 'Datos', ejecutar: exportarConfiguracion },
    { titulo: 'Importar configuración', grupo: 'Datos', ejecutar: importarConfiguracion },
    {
      titulo: 'Mostrar todas las columnas',
      grupo: 'Espacios',
      ejecutar: () => seleccionarEspacio('').catch((error) => mostrarMensaje(mensajeLimpio(error))),
    },
  ];

  for (const espacio of ajustesActuales?.espaciosTrabajo ?? []) {
    comandos.push({
      titulo: `Activar espacio ${espacio.nombre}`,
      grupo: 'Espacios',
      ejecutar: () => seleccionarEspacio(espacio.id).catch((error) => mostrarMensaje(mensajeLimpio(error))),
    });
  }

  for (const id of tablero.idsVisibles()) {
    const columna = tablero.columnas.get(id);
    comandos.push({
      titulo: `Ir a ${columna.columna.titulo}`,
      grupo: 'Columna',
      ejecutar: () => tablero.saltarAColumna(id),
    });
    if (columna.vivo) {
      const expandida = columna.estadoUi.expandida === true;
      comandos.push({
        titulo: `${expandida ? 'Restaurar ancho de' : 'Usar espacio libre en'} ${columna.columna.titulo}`,
        grupo: 'WebView',
        ejecutar: () => tablero.setWebviewExpandida(id, !expandida),
      });
    }
  }
  return comandos;
}

function pintarComandos() {
  const consulta = textoComparable(campoPaleta.value.trim());
  comandosFiltrados = comandosDisponibles().filter((comando) =>
    textoComparable(`${comando.titulo} ${comando.grupo}`).includes(consulta),
  );
  comandoActivo = Math.min(comandoActivo, Math.max(0, comandosFiltrados.length - 1));
  listaPaleta.replaceChildren();

  comandosFiltrados.forEach((comando, indice) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `comando-item${indice === comandoActivo ? ' activo' : ''}`;
    boton.setAttribute('role', 'option');
    boton.setAttribute('aria-selected', String(indice === comandoActivo));
    const titulo = document.createElement('span');
    titulo.textContent = comando.titulo;
    const grupo = document.createElement('small');
    grupo.textContent = comando.grupo;
    boton.append(titulo, grupo);
    boton.addEventListener('click', () => ejecutarComando(comando));
    listaPaleta.appendChild(boton);
  });
}

function ejecutarComando(comando = comandosFiltrados[comandoActivo]) {
  if (!comando) return;
  dialogoPaleta.close();
  setTimeout(comando.ejecutar, 0);
}

function abrirPaleta() {
  cerrarMenuMas();
  if (hayDialogoAbierto()) return;
  campoPaleta.value = '';
  comandoActivo = 0;
  pintarComandos();
  dialogoPaleta.showModal();
  requestAnimationFrame(() => campoPaleta.focus());
}

document.getElementById('btn-paleta').addEventListener('click', abrirPaleta);
campoPaleta.addEventListener('input', () => {
  comandoActivo = 0;
  pintarComandos();
});
campoPaleta.addEventListener('keydown', (evento) => {
  if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
    evento.preventDefault();
    const paso = evento.key === 'ArrowDown' ? 1 : -1;
    comandoActivo = Math.max(0, Math.min(comandosFiltrados.length - 1, comandoActivo + paso));
    pintarComandos();
    listaPaleta.children[comandoActivo]?.scrollIntoView({ block: 'nearest' });
  }
  if (evento.key === 'Enter') {
    evento.preventDefault();
    ejecutarComando();
  }
});

// --- Formulario para añadir columna ---

const dialogo = document.getElementById('dialogo-columna');
const formulario = document.getElementById('form-columna');
const campoFuente = document.getElementById('campo-fuente');
const selectorTipo = document.getElementById('campo-tipo');

function abrirDialogoColumna() {
  dialogo.showModal();
  requestAnimationFrame(() => document.getElementById('campo-titulo').focus());
}

document.getElementById('btn-anadir').addEventListener('click', abrirDialogoColumna);
document.getElementById('btn-estado-anadir').addEventListener('click', abrirDialogoColumna);
document.getElementById('btn-estado-reintentar').addEventListener('click', recargarColumnas);
document.getElementById('btn-cancelar').addEventListener('click', () => dialogo.close());

const avisoTipo = document.getElementById('aviso-tipo');
const pistaFuente = document.getElementById('pista-fuente');
const errorColumna = document.getElementById('error-columna');
const campoVivo = document.getElementById('campo-vivo');
const ordenWrap = document.getElementById('campo-orden-wrap');
const campoOrden = document.getElementById('campo-orden');
const btnCrearColumna = formulario.querySelector('button[type="submit"]');

// Que escribir en "Fuente" segun el tipo. Se puede pegar la URL de X tal cual.
const AYUDA_FUENTE = {
  list: {
    placeholder: 'https://x.com/i/lists/1234567890',
    pista: 'Pega la URL de la lista, o solo su número.',
  },
  user: {
    placeholder: 'https://x.com/jack  o  @jack',
    pista: 'Pega la URL del perfil, el handle con @ o sin él.',
  },
  search: {
    placeholder: 'gatos lang:es',
    pista: 'Los términos a buscar, o la URL de una búsqueda de X.',
  },
};

// Inicio y notificaciones no necesitan fuente.
function actualizarVisibilidadFuente() {
  const tipo = selectorTipo.value;
  const ayuda = AYUDA_FUENTE[tipo];

  campoFuente.parentElement.style.display = ayuda ? '' : 'none';
  campoFuente.required = Boolean(ayuda);

  if (ayuda) {
    campoFuente.placeholder = ayuda.placeholder;
    pistaFuente.textContent = ayuda.pista;
  }

  // "Guardados" sale de la base de datos local: no puede ser webview en vivo.
  const permiteVivo = tipo !== 'saved';
  campoVivo.parentElement.style.display = permiteVivo ? '' : 'none';
  if (!permiteVivo) campoVivo.checked = false;

  // El orden solo aplica a las búsquedas.
  ordenWrap.hidden = tipo !== 'search';

  // El selector de listas solo aparece en el tipo "Lista".
  listaSelector.hidden = tipo !== 'list';
  if (tipo === 'list') cargarListas();

  avisoTipo.hidden = tipo !== 'notifications';
  errorColumna.hidden = true;
}

selectorTipo.addEventListener('change', actualizarVisibilidadFuente);

// --- Selector de listas del usuario ---

const listaSelector = document.getElementById('lista-selector');
const listaBotones = document.getElementById('lista-botones');
const listaVacia = document.getElementById('lista-vacia');
const btnActualizarListas = document.getElementById('btn-actualizar-listas');

/** Pinta las listas como botones; al pulsar uno, crea la columna. */
function pintarListas(listas) {
  listaBotones.replaceChildren();
  listaVacia.hidden = listas.length > 0;

  for (const lista of listas) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'lista-boton';
    const privacidad = lista.modo === 'private' ? 'privada, ' : '';
    const miembros = `${lista.miembros} ${lista.miembros === 1 ? 'miembro' : 'miembros'}`;
    boton.textContent = `${lista.nombre} (${privacidad}${miembros})`;
    boton.title = lista.descripcion || lista.nombre;
    boton.addEventListener('click', () =>
      crearColumnaDirecta({ titulo: 'Lista: ' + lista.nombre, tipo: 'list', fuente: lista.id }),
    );
    listaBotones.appendChild(boton);
  }
}

async function cargarListas() {
  const listas = await window.api.listarListas();
  pintarListas(listas);
}

btnActualizarListas.addEventListener('click', async () => {
  btnActualizarListas.disabled = true;
  btnActualizarListas.textContent = 'Actualizando…';
  const listas = await window.api.refrescarListas();
  pintarListas(listas);
  btnActualizarListas.textContent = 'Actualizar';
  btnActualizarListas.disabled = false;
});

/** Crea una columna con datos ya listos (sin pasar por el formulario). */
async function crearColumnaDirecta(datos) {
  try {
    await window.api.crearColumna(datos);
  } catch (error) {
    errorColumna.textContent = mensajeLimpio(error);
    errorColumna.hidden = false;
    return;
  }
  formulario.reset();
  actualizarVisibilidadFuente();
  dialogo.close();
  await recargarColumnas();
}

actualizarVisibilidadFuente();

// Un error que viene por IPC llega envuelto:
// "Error invoking remote method 'columnas:crear': Error: El mensaje de verdad"
// Nos quedamos con lo ultimo, que es lo que escribimos nosotros.
function mensajeLimpio(error) {
  const partes = String(error.message).split('Error: ');
  return partes[partes.length - 1];
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  btnCrearColumna.disabled = true;
  btnCrearColumna.textContent = 'Creando…';

  const datos = {
    titulo: document.getElementById('campo-titulo').value.trim(),
    tipo: selectorTipo.value,
    fuente: campoFuente.value.trim(),
    vivo: campoVivo.checked,
    filtros: selectorTipo.value === 'search' ? { orden: campoOrden.value } : {},
  };

  try {
    await window.api.crearColumna(datos);
  } catch (error) {
    // La fuente no valia. Dejamos el diálogo abierto para que lo corrija.
    errorColumna.textContent = mensajeLimpio(error);
    errorColumna.hidden = false;
    btnCrearColumna.disabled = false;
    btnCrearColumna.textContent = 'Crear columna';
    return;
  }

  formulario.reset();
  actualizarVisibilidadFuente();
  dialogo.close();

  await recargarColumnas();
  btnCrearColumna.disabled = false;
  btnCrearColumna.textContent = 'Crear columna';
});

// --- Modal de opciones ---

const dialogoOpciones = document.getElementById('dialogo-opciones');
const listaModsX = document.getElementById('lista-mods-x');
const campoDensidad = document.getElementById('campo-densidad');
const campoAnchoColumna = document.getElementById('campo-ancho-columna');
const campoPalabrasSilenciadas = document.getElementById('campo-palabras-silenciadas');
const campoUsuariosSilenciados = document.getElementById('campo-usuarios-silenciados');
const campoOcultarRetweets = document.getElementById('campo-ocultar-retweets');
const campoOcultarMedia = document.getElementById('campo-ocultar-media');
let temporizadorFiltros = null;
let modsXEnEdicion = {};

function abrirDialogoOpciones() {
  cerrarMenuMas();
  if (!dialogoOpciones.open) dialogoOpciones.showModal();
}

document.getElementById('btn-opciones').addEventListener('click', abrirDialogoOpciones);

document.getElementById('btn-cerrar-opciones').addEventListener('click', () => {
  dialogoOpciones.close();
});

function pintarModsX(modsX) {
  modsXEnEdicion = { ...modsX };
  listaModsX.replaceChildren();

  for (const mod of window.config.modsXDisponibles) {
    const etiqueta = document.createElement('label');
    const nombre = document.createElement('span');
    nombre.textContent = mod.nombre;

    const descripcion = document.createElement('small');
    descripcion.textContent = `${mod.tipo} · ${mod.descripcion}`;

    const guardarCambio = async (campo, valor) => {
      const anterior = { ...modsXEnEdicion };
      modsXEnEdicion = { ...modsXEnEdicion, [mod.id]: valor };
      tablero.setModsX(modsXEnEdicion);

      try {
        const guardados = await guardarAjustesUi({ modsX: modsXEnEdicion });
        modsXEnEdicion = { ...guardados.modsX };
      } catch (error) {
        modsXEnEdicion = anterior;
        if (mod.control === 'select') campo.value = anterior[mod.id];
        else campo.checked = anterior[mod.id] === true;
        tablero.setModsX(anterior);
        mostrarMensaje(mensajeLimpio(error));
      }
    };

    if (mod.control === 'select') {
      etiqueta.className = 'mod-x mod-x--select';

      const textos = document.createElement('span');
      textos.className = 'mod-x-textos';
      textos.append(nombre, descripcion);

      const campo = document.createElement('select');
      campo.setAttribute('aria-label', mod.nombre);
      for (const opcion of mod.opciones) {
        campo.appendChild(new Option(opcion.nombre, opcion.valor));
      }
      campo.value = modsXEnEdicion[mod.id];
      campo.addEventListener('change', () => guardarCambio(campo, campo.value));
      etiqueta.append(textos, campo);
    } else {
      etiqueta.className = 'checkbox checkbox--panel mod-x';

      const campo = document.createElement('input');
      campo.type = 'checkbox';
      campo.checked = modsXEnEdicion[mod.id] === true;
      campo.addEventListener('change', () => guardarCambio(campo, campo.checked));
      etiqueta.append(campo, nombre, descripcion);
    }

    listaModsX.appendChild(etiqueta);
  }
}

campoDensidad.addEventListener('change', async () => {
  document.body.dataset.densidad = campoDensidad.value;
  await guardarAjustesUi({ densidad: campoDensidad.value });
});

campoAnchoColumna.addEventListener('change', async () => {
  const anchoColumna = Number(campoAnchoColumna.value);
  tablero.anchoPredeterminado = anchoColumna;
  await guardarAjustesUi({ anchoColumna });
});

function valoresSeparados(texto) {
  return [...new Set(texto.split(/[\n,]+/).map((valor) => valor.trim()).filter(Boolean))];
}

async function guardarFiltrosLocales() {
  const filtrosLocales = {
    palabras: valoresSeparados(campoPalabrasSilenciadas.value),
    usuarios: valoresSeparados(campoUsuariosSilenciados.value),
    ocultarRetweets: campoOcultarRetweets.checked,
    ocultarMedia: campoOcultarMedia.checked,
  };
  tablero.setFiltrosLocales(filtrosLocales);
  await guardarAjustesUi({ filtrosLocales });
}

function programarGuardadoFiltros() {
  if (temporizadorFiltros) clearTimeout(temporizadorFiltros);
  temporizadorFiltros = setTimeout(() => guardarFiltrosLocales().catch(console.error), 300);
}

campoPalabrasSilenciadas.addEventListener('input', programarGuardadoFiltros);
campoUsuariosSilenciados.addEventListener('input', programarGuardadoFiltros);
campoOcultarRetweets.addEventListener('change', programarGuardadoFiltros);
campoOcultarMedia.addEventListener('change', programarGuardadoFiltros);

async function aplicarAjustes(ajustes) {
  ajustesActuales = ajustes;
  pintarModsX(ajustes.modsX);
  campoDensidad.value = ajustes.densidad;
  campoAnchoColumna.value = String(ajustes.anchoColumna);
  campoPalabrasSilenciadas.value = ajustes.filtrosLocales.palabras.join(', ');
  campoUsuariosSilenciados.value = ajustes.filtrosLocales.usuarios.join(', ');
  campoOcultarRetweets.checked = ajustes.filtrosLocales.ocultarRetweets;
  campoOcultarMedia.checked = ajustes.filtrosLocales.ocultarMedia;

  document.body.dataset.densidad = ajustes.densidad;
  tablero.setModsX(ajustes.modsX);
  tablero.setPreferencias(ajustes);
  aplicarVisibilidadBarra(ajustes.mostrarBarraHerramientas);
  aplicarPlegadoCabeceras(ajustes.cabecerasPlegadas);
  cosechaPausada = ajustes.cosechaPausada;
  pintarPausaCosecha();
  pintarEspacios();
}

/** Lee los ajustes guardados y los aplica al tablero y al modal. */
async function cargarAjustes() {
  const ajustes = await window.api.leerAjustes();
  await aplicarAjustes(ajustes);
}

function hayDialogoAbierto() {
  return Boolean(document.querySelector('dialog[open]'));
}

function ejecutarAtajo(accion) {
  if (accion === 'alternar-barra') {
    guardarVisibilidadBarra(barraHerramientas.hidden);
    return;
  }

  if (accion === 'alternar-cabeceras') {
    guardarPlegadoCabeceras(!cabecerasPlegadas);
    return;
  }

  // No abrimos otro modal ni refrescamos por debajo de un formulario abierto.
  if (hayDialogoAbierto()) return;

  if (accion === 'columna-anterior') return tablero.navegarColumnas('anterior');
  if (accion === 'columna-siguiente') return tablero.navegarColumnas('siguiente');
  if (accion === 'primera-columna') return tablero.navegarColumnas('primera');
  if (accion === 'ultima-columna') return tablero.navegarColumnas('ultima');
  if (accion === 'nueva-columna') abrirDialogoColumna();
  if (accion === 'refrescar-columnas') document.getElementById('btn-refrescar').click();
  if (accion === 'abrir-opciones') abrirDialogoOpciones();
  if (accion === 'abrir-paleta') abrirPaleta();
}

window.api.alAtajo(ejecutarAtajo);

// --- Aviso de sesion ---

const avisoSesion = document.getElementById('aviso-sesion');

function mostrarEstadoSesion(sesionIniciada) {
  avisoSesion.hidden = sesionIniciada;
}

document.getElementById('btn-entrar').addEventListener('click', () => {
  window.api.abrirX();
});

// Para cuando el login se queda a medias: X invalido la sesion, pero las cookies
// viejas siguen aqui y atascan el flujo de login. Borrarlas lo desbloquea.
const btnLimpiarSesion = document.getElementById('btn-limpiar-sesion');

btnLimpiarSesion.addEventListener('click', async () => {
  cerrarMenuMas();
  if (!confirm('Se borrarán las cookies de X y tendrás que iniciar sesión de nuevo. ¿Seguir?')) {
    return;
  }

  btnLimpiarSesion.disabled = true;
  const titulo = btnLimpiarSesion.querySelector('.menu-accion-titulo');
  const pista = btnLimpiarSesion.querySelector('.menu-accion-pista');
  const textoOriginal = titulo.textContent;
  titulo.textContent = 'Limpiando…';
  pista.hidden = true;
  try {
    await window.api.limpiarSesionX();
  } finally {
    titulo.textContent = textoOriginal;
    pista.hidden = false;
    btnLimpiarSesion.disabled = false;
  }
});

// --- Actualizaciones que llegan desde main ---

window.api.alActualizarColumna(({ columnaId, nuevos }) => {
  console.log(`[ui] columna ${columnaId}: ${nuevos} tweets nuevos`);
  tablero.registrarNuevos(columnaId, nuevos);
});

window.api.alEstadoColumna(({ columnaId, fase, actualizadaEn }) => {
  tablero.setEstadoColumna(columnaId, { fase, actualizadaEn });
});

window.api.alCambiarEstado(({ sesionIniciada }) => {
  mostrarEstadoSesion(sesionIniciada);
  // Al iniciar sesion empiezan a llegar tweets: repintamos lo que ya haya.
  if (sesionIniciada) tablero.refrescarTodas();
});

async function arrancar() {
  try {
    const { sesionIniciada } = await window.api.estado();
    mostrarEstadoSesion(sesionIniciada);

    // ANTES de crear las columnas: así cada columna en vivo nace ya con el ajuste
    // puesto y no hay que recorrerlas otra vez después.
    await cargarAjustes();

    await recargarColumnas();
  } catch (error) {
    const mensaje = mensajeLimpio(error);
    actualizarEstado({ cargando: false, error: mensaje });
    tablero.mostrarEstado('error', mensaje);
    console.error('[ui] no se pudo iniciar la interfaz:', error);
  }
}

arrancar();
