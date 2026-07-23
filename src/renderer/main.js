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
const dialogoEspacio = document.getElementById('dialogo-espacio');
const formularioEspacio = document.getElementById('form-espacio');
const campoNombreEspacio = document.getElementById('campo-nombre-espacio');

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
    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.textContent = '×';
    borrar.title = `Eliminar espacio ${espacio.nombre}`;
    borrar.setAttribute('aria-label', borrar.title);
    borrar.addEventListener('click', () => borrarEspacio(espacio.id));
    fila.appendChild(borrar);
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

function abrirDialogoEspacio() {
  cerrarMenuMas();
  if (document.getElementById('dialogo-opciones').open) document.getElementById('dialogo-opciones').close();
  formularioEspacio.reset();
  dialogoEspacio.showModal();
  requestAnimationFrame(() => campoNombreEspacio.focus());
}

document.getElementById('btn-guardar-espacio').addEventListener('click', abrirDialogoEspacio);
document.getElementById('btn-nuevo-espacio-opciones').addEventListener('click', abrirDialogoEspacio);
document.getElementById('btn-cancelar-espacio').addEventListener('click', () => dialogoEspacio.close());

formularioEspacio.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const nombre = campoNombreEspacio.value.trim();
  if (!nombre) return;
  const nuevo = {
    id: `espacio-${Date.now().toString(36)}`,
    nombre,
    columnas: tablero.idsVisibles(),
  };
  const espaciosTrabajo = [...(ajustesActuales?.espaciosTrabajo ?? []), nuevo];
  await guardarAjustesUi({ espaciosTrabajo, espacioActivo: nuevo.id });
  formularioEspacio.reset();
  dialogoEspacio.close();
  pintarEspacios();
  mostrarMensaje(`Espacio “${nombre}” guardado`);
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
    { titulo: 'Abrir opciones', grupo: 'Acción', ejecutar: abrirDialogoOpciones },
    { titulo: 'Guardar espacio actual', grupo: 'Espacios', ejecutar: abrirDialogoEspacio },
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
const campoAutoMostrar = document.getElementById('campo-auto-mostrar');
const campoDensidad = document.getElementById('campo-densidad');
const campoAnchoColumna = document.getElementById('campo-ancho-columna');
const campoPalabrasSilenciadas = document.getElementById('campo-palabras-silenciadas');
const campoUsuariosSilenciados = document.getElementById('campo-usuarios-silenciados');
const campoOcultarRetweets = document.getElementById('campo-ocultar-retweets');
const campoOcultarMedia = document.getElementById('campo-ocultar-media');
let temporizadorFiltros = null;

function abrirDialogoOpciones() {
  cerrarMenuMas();
  if (!dialogoOpciones.open) dialogoOpciones.showModal();
}

document.getElementById('btn-opciones').addEventListener('click', abrirDialogoOpciones);

document.getElementById('btn-cerrar-opciones').addEventListener('click', () => {
  dialogoOpciones.close();
});

// Se guarda al momento de marcarlo, sin boton de "aceptar": es un solo ajuste y
// asi se ve el efecto en las columnas al instante.
campoAutoMostrar.addEventListener('change', async () => {
  const activo = campoAutoMostrar.checked;

  tablero.setAutoMostrarPosts(activo);
  await guardarAjustesUi({ autoMostrarPostsNuevos: activo });
});

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
  campoAutoMostrar.checked = ajustes.autoMostrarPostsNuevos;
  campoDensidad.value = ajustes.densidad;
  campoAnchoColumna.value = String(ajustes.anchoColumna);
  campoPalabrasSilenciadas.value = ajustes.filtrosLocales.palabras.join(', ');
  campoUsuariosSilenciados.value = ajustes.filtrosLocales.usuarios.join(', ');
  campoOcultarRetweets.checked = ajustes.filtrosLocales.ocultarRetweets;
  campoOcultarMedia.checked = ajustes.filtrosLocales.ocultarMedia;

  document.body.dataset.densidad = ajustes.densidad;
  tablero.setAutoMostrarPosts(ajustes.autoMostrarPostsNuevos);
  tablero.setPreferencias(ajustes);
  aplicarVisibilidadBarra(ajustes.mostrarBarraHerramientas);
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
