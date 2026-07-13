// Nombres de los canales IPC. Un solo sitio para evitar erratas entre procesos.

const CANALES = {
  // El renderer pregunta, main responde (invoke/handle)
  COLUMNAS_LISTAR: 'columnas:listar',
  COLUMNAS_CREAR: 'columnas:crear',
  COLUMNAS_BORRAR: 'columnas:borrar',
  TWEETS_DE_COLUMNA: 'tweets:deColumna',
  TWEETS_GUARDADOS: 'tweets:guardados',
  TWEET_GUARDAR: 'tweets:guardar',
  TWEET_EXPORTAR: 'tweets:exportar',
  LISTAS_LISTAR: 'listas:listar',
  LISTAS_REFRESCAR: 'listas:refrescar',
  X_ABRIR_LOGIN: 'x:abrirLogin',
  X_ABRIR_URL: 'x:abrirUrl',
  X_LIMPIAR_SESION: 'x:limpiarSesion',
  ESTADO_APP: 'app:estado',

  // Main avisa al renderer (send/on)
  COLUMNA_ACTUALIZADA: 'columna:actualizada',
  COLUMNA_ESTADO: 'columna:estado',
  ESTADO_CAMBIADO: 'app:estadoCambiado',
};

module.exports = { CANALES };
