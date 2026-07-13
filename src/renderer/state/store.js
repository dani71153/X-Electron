// Estado de la interfaz. Muy simple a proposito: un objeto y suscriptores.
// Si algun dia crece, aqui es donde entraria una libreria de estado.

const estado = {
  columnas: [],
  cargando: true,
};

const suscriptores = new Set();

function obtenerEstado() {
  return estado;
}

/** Cambia el estado y avisa a quien escuche. */
function actualizarEstado(cambios) {
  Object.assign(estado, cambios);
  for (const suscriptor of suscriptores) suscriptor(estado);
}

function suscribirse(callback) {
  suscriptores.add(callback);
  return () => suscriptores.delete(callback);
}

export { obtenerEstado, actualizarEstado, suscribirse };
