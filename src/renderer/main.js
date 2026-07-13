// Arranque de la interfaz.

import { Tablero } from './layout/Board.js';
import { actualizarEstado } from './state/store.js';

const contenedor = document.getElementById('tablero');

async function recargarColumnas() {
  const columnas = await window.api.listarColumnas();
  actualizarEstado({ columnas, cargando: false });
  await tablero.sincronizar(columnas);
}

const tablero = new Tablero(contenedor, recargarColumnas);

// Al final del archivo se llama a arrancar(), que ademas comprueba la sesion.

// --- Barra superior ---

document.getElementById('btn-abrir-x').addEventListener('click', () => {
  window.api.abrirX();
});

document.getElementById('btn-refrescar').addEventListener('click', () => {
  tablero.refrescarTodas();
});

// --- Formulario para añadir columna ---

const dialogo = document.getElementById('dialogo-columna');
const formulario = document.getElementById('form-columna');
const campoFuente = document.getElementById('campo-fuente');
const selectorTipo = document.getElementById('campo-tipo');

document.getElementById('btn-anadir').addEventListener('click', () => dialogo.showModal());
document.getElementById('btn-cancelar').addEventListener('click', () => dialogo.close());

const avisoTipo = document.getElementById('aviso-tipo');
const pistaFuente = document.getElementById('pista-fuente');
const errorColumna = document.getElementById('error-columna');
const campoVivo = document.getElementById('campo-vivo');
const ordenWrap = document.getElementById('campo-orden-wrap');
const campoOrden = document.getElementById('campo-orden');

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
    const candado = lista.modo === 'private' ? '🔒 ' : '';
    boton.textContent = `${candado}${lista.nombre} · ${lista.miembros}`;
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
    return;
  }

  formulario.reset();
  actualizarVisibilidadFuente();
  dialogo.close();

  await recargarColumnas();
});

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
  if (!confirm('Se borrarán las cookies de X y tendrás que iniciar sesión de nuevo. ¿Seguir?')) {
    return;
  }

  btnLimpiarSesion.disabled = true;
  try {
    await window.api.limpiarSesionX();
  } finally {
    btnLimpiarSesion.disabled = false;
  }
});

// --- Actualizaciones que llegan desde main ---

window.api.alActualizarColumna(({ columnaId, nuevos }) => {
  console.log(`[ui] columna ${columnaId}: ${nuevos} tweets nuevos`);
  tablero.refrescarColumna(columnaId);
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
  const { sesionIniciada } = await window.api.estado();
  mostrarEstadoSesion(sesionIniciada);
  await recargarColumnas();
}

arrancar();
