// Todos los canales IPC en un solo archivo.
// El renderer nunca toca la base de datos ni Electron directamente: pasa por aqui.

const fs = require('fs');
const { ipcMain, dialog } = require('electron');
const { CANALES } = require('../shared/channels');
const { AJUSTES } = require('../../config/settings');
const consultas = require('./db/queries');
const { abrirVentanaX } = require('./window');
const { haySesionIniciada, limpiarSesionX } = require('./session');
const { normalizarFuente } = require('./harvest/fuente');
const { urlDeColumna } = require('./harvest/harvester');
const { cosecharListas } = require('./harvest/listas');

/** Añade a cada columna su URL de X, que el renderer usa para las webviews. */
function conUrl(columnas) {
  return columnas.map((columna) => ({ ...columna, url: urlDeColumna(columna) }));
}

/**
 * Los ajustes del usuario, ya con los valores por defecto puestos y con los tipos
 * correctos: en la tabla `settings` todo se guarda como texto.
 */
function ajustesDeUsuario() {
  const guardados = consultas.leerAjustes();
  const porDefecto = AJUSTES.AJUSTES_POR_DEFECTO;

  return {
    autoMostrarPostsNuevos:
      guardados.autoMostrarPostsNuevos === undefined
        ? porDefecto.autoMostrarPostsNuevos
        : guardados.autoMostrarPostsNuevos === '1',
  };
}

/**
 * @param {() => void} alCambiarColumnas Se llama cuando hay que reconfigurar los cosechadores
 */
function registrarIpc(alCambiarColumnas) {
  ipcMain.handle(CANALES.COLUMNAS_LISTAR, () => {
    return conUrl(consultas.listarColumnas());
  });

  // Estos dos esperan a que la cosecha se reconfigure. Si no lo hicieran, dos
  // altas de columna seguidas podrian arrancar dos bucles de cosecha a la vez.
  ipcMain.handle(CANALES.COLUMNAS_CREAR, async (_evento, datos) => {
    // Acepta URLs pegadas. Si la fuente no vale, lanza un Error con un mensaje
    // entendible y el renderer lo enseña sin crear la columna.
    const fuente = normalizarFuente(datos.tipo, datos.fuente);

    const id = consultas.crearColumna({ ...datos, fuente });
    await alCambiarColumnas();
    return id;
  });

  ipcMain.handle(CANALES.COLUMNAS_BORRAR, async (_evento, columnaId) => {
    consultas.borrarColumna(columnaId);
    await alCambiarColumnas();
  });

  // Reordenar es SOLO visual: cambia el orden en que se pintan las columnas.
  //
  // OJO: aqui NO se llama a alCambiarColumnas() a proposito. Reconfigurar la
  // cosecha destruiria las ventanas de los cosechadores y volveria a cargar las
  // paginas de X (una carga en frio dispara una rafaga de peticiones). Mover una
  // columna de sitio no cambia QUE se cosecha, asi que la cosecha ni se entera.
  ipcMain.handle(CANALES.COLUMNAS_REORDENAR, (_evento, idsEnOrden) => {
    consultas.reordenarColumnas(idsEnOrden);
  });

  ipcMain.handle(CANALES.TWEETS_DE_COLUMNA, (_evento, columnaId) => {
    return consultas.tweetsDeColumna(columnaId, AJUSTES.TWEETS_POR_COLUMNA);
  });

  ipcMain.handle(CANALES.TWEETS_GUARDADOS, () => {
    return consultas.tweetsGuardados(AJUSTES.TWEETS_POR_COLUMNA);
  });

  ipcMain.handle(CANALES.TWEET_GUARDAR, (_evento, { tweetId, guardado }) => {
    consultas.marcarGuardado(tweetId, guardado);
  });

  ipcMain.handle(CANALES.TWEET_EXPORTAR, async (_evento, tweetId) => {
    const raw = consultas.rawDeTweet(tweetId);
    if (!raw) return { ok: false, motivo: 'Ese tweet no tiene JSON guardado.' };

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar JSON del tweet',
      defaultPath: `tweet-${tweetId}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, cancelado: true };

    // raw_json se guardo como string JSON; lo reindentamos para que sea legible.
    let contenido = raw;
    try {
      contenido = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      /* si no parsea, guardamos el texto tal cual */
    }
    fs.writeFileSync(filePath, contenido, 'utf8');
    return { ok: true, ruta: filePath };
  });

  ipcMain.handle(CANALES.AJUSTES_LEER, () => ajustesDeUsuario());

  ipcMain.handle(CANALES.AJUSTES_GUARDAR, (_evento, ajustes) => {
    // Se comprueba el tipo a proposito: solo guardamos lo que reconocemos, para
    // que un error del renderer no meta basura en la tabla.
    if (typeof ajustes.autoMostrarPostsNuevos === 'boolean') {
      consultas.guardarAjuste('autoMostrarPostsNuevos', ajustes.autoMostrarPostsNuevos ? '1' : '0');
    }
    return ajustesDeUsuario();
  });

  ipcMain.handle(CANALES.ESTADO_APP, async () => {
    return { sesionIniciada: await haySesionIniciada() };
  });

  ipcMain.handle(CANALES.LISTAS_LISTAR, () => {
    return consultas.listarListas();
  });

  // Abre x.com/i/lists en segundo plano, captura las listas y las devuelve.
  ipcMain.handle(CANALES.LISTAS_REFRESCAR, async () => {
    await cosecharListas();
    return consultas.listarListas();
  });

  ipcMain.handle(CANALES.X_ABRIR_LOGIN, () => {
    // Al cerrar la ventana de X damos por hecho que el usuario ya ha iniciado
    // sesion (o no). Reconfiguramos: si ahora hay sesion, empieza la cosecha.
    abrirVentanaX('https://x.com/home', () => alCambiarColumnas());
  });

  // Borra la sesion de X y abre el login limpio.
  //
  // Es la salida cuando X ha invalidado la sesion por su cuenta: las cookies
  // viejas se quedan aqui y hacen que el login se quede a medias (ver session.js).
  ipcMain.handle(CANALES.X_LIMPIAR_SESION, async () => {
    await limpiarSesionX();

    // Sin cookies ya no hay sesion: esto para los cosechadores y hace que la
    // interfaz enseñe el aviso de "inicia sesion".
    await alCambiarColumnas();

    abrirVentanaX('https://x.com/login', () => alCambiarColumnas());
  });

  // Abre una URL concreta de X en la ventana aparte. Se usa como respaldo al
  // abrir un tweet cuando no hay ninguna columna en vivo donde mostrarlo.
  ipcMain.handle(CANALES.X_ABRIR_URL, (_evento, url) => {
    if (typeof url === 'string' && /^https:\/\/x\.com\//.test(url)) {
      abrirVentanaX(url, () => alCambiarColumnas());
    }
  });
}

module.exports = { registrarIpc };
