// Todos los canales IPC en un solo archivo.
// El renderer nunca toca la base de datos ni Electron directamente: pasa por aqui.

const fs = require('fs');
const { ipcMain, dialog } = require('electron');
const { CANALES } = require('../shared/channels');
const { normalizarModsX } = require('../shared/x-mods');
const { AJUSTES } = require('../../config/settings');
const consultas = require('./db/queries');
const { abrirVentanaX, configurarModsVentanaX } = require('./window');
const { haySesionIniciada, limpiarSesionX } = require('./session');
const { normalizarFuente } = require('./harvest/fuente');
const { urlDeColumna } = require('./harvest/harvester');
const { cosecharListas } = require('./harvest/listas');

const TIPOS_COLUMNA = new Set(['home', 'notifications', 'list', 'user', 'search', 'saved']);
const ORDENES_LOCALES = new Set(['recientes', 'antiguos', 'dia', 'autor', 'media']);
const ORDENES_BUSQUEDA = new Set(['live', 'top', 'user', 'media']);

function jsonSeguro(texto, fallback) {
  if (typeof texto !== 'string') return fallback;
  try {
    return JSON.parse(texto);
  } catch {
    return fallback;
  }
}

function listaDeTextos(valor) {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 100);
}

function normalizarFiltrosLocales(valor) {
  const objeto = valor && typeof valor === 'object' ? valor : {};
  return {
    palabras: listaDeTextos(objeto.palabras),
    usuarios: listaDeTextos(objeto.usuarios).map((usuario) => usuario.replace(/^@/, '')),
    ocultarRetweets: objeto.ocultarRetweets === true,
    ocultarMedia: objeto.ocultarMedia === true,
  };
}

function normalizarEstadoColumnas(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const estado = {};

  for (const [id, datos] of Object.entries(valor).slice(0, 500)) {
    if (!/^\d+$/.test(id) || !datos || typeof datos !== 'object') continue;
    estado[id] = {
      colapsada: datos.colapsada === true,
      expandida: datos.expandida === true,
      ancho: Math.max(280, Math.min(720, Number(datos.ancho) || 380)),
      leidoHasta: Math.max(0, Number(datos.leidoHasta) || 0),
      orden: ORDENES_LOCALES.has(datos.orden) ? datos.orden : 'recientes',
    };
  }
  return estado;
}

function normalizarEspacios(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.slice(0, 50).flatMap((espacio, indice) => {
    if (!espacio || typeof espacio !== 'object') return [];
    const nombre = String(espacio.nombre ?? '').trim().slice(0, 50);
    if (!nombre) return [];
    const columnas = Array.isArray(espacio.columnas)
      ? [...new Set(espacio.columnas.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 100)
      : [];
    return [{
      id: String(espacio.id ?? `espacio-${indice}`).slice(0, 64),
      nombre,
      columnas,
    }];
  });
}

function normalizarDefinicionColumna(datos, indice = 0) {
  if (!datos || typeof datos !== 'object' || !TIPOS_COLUMNA.has(datos.tipo)) {
    throw new Error(`La columna ${indice + 1} no tiene un tipo válido.`);
  }

  const titulo = String(datos.titulo ?? '').trim().slice(0, 100);
  if (!titulo) throw new Error(`La columna ${indice + 1} necesita un título.`);

  const idNumero = Number(datos.id);
  const id = Number.isSafeInteger(idNumero) && idNumero > 0 ? idNumero : null;
  const fuente = normalizarFuente(datos.tipo, datos.fuente);
  const ordenBusqueda = ORDENES_BUSQUEDA.has(datos.filtros?.orden)
    ? datos.filtros.orden
    : 'live';

  return {
    clave: String(datos.clave ?? `columna-${indice}`).slice(0, 80),
    id,
    titulo,
    tipo: datos.tipo,
    fuente,
    vivo: datos.tipo !== 'saved' && datos.vivo === true,
    filtros: datos.tipo === 'search' ? { orden: ordenBusqueda } : {},
  };
}

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

  const filtrosLocales = normalizarFiltrosLocales(
    jsonSeguro(guardados.filtrosLocales, porDefecto.filtrosLocales),
  );
  const estadoColumnas = normalizarEstadoColumnas(
    jsonSeguro(guardados.estadoColumnas, porDefecto.estadoColumnas),
  );
  const espaciosTrabajo = normalizarEspacios(
    jsonSeguro(guardados.espaciosTrabajo, porDefecto.espaciosTrabajo),
  );
  const modsGuardados = {
    ...jsonSeguro(guardados.modsX, porDefecto.modsX),
  };
  // Compatibilidad con configuraciones exportadas antes del sistema de mods.
  if (guardados.modsX === undefined && guardados.autoMostrarPostsNuevos !== undefined) {
    modsGuardados.autoMostrarPosts = guardados.autoMostrarPostsNuevos === '1';
  }
  const modsX = normalizarModsX(modsGuardados, porDefecto.modsX);
  const idsEspacios = new Set(espaciosTrabajo.map((espacio) => espacio.id));
  const espacioActivo = idsEspacios.has(guardados.espacioActivo) ? guardados.espacioActivo : null;

  return {
    modsX,
    mostrarBarraHerramientas:
      guardados.mostrarBarraHerramientas === undefined
        ? porDefecto.mostrarBarraHerramientas
        : guardados.mostrarBarraHerramientas === '1',
    cabecerasPlegadas:
      guardados.cabecerasPlegadas === undefined
        ? porDefecto.cabecerasPlegadas
        : guardados.cabecerasPlegadas === '1',
    cosechaPausada:
      guardados.cosechaPausada === undefined
        ? porDefecto.cosechaPausada
        : guardados.cosechaPausada === '1',
    densidad: ['compacta', 'comoda'].includes(guardados.densidad)
      ? guardados.densidad
      : porDefecto.densidad,
    anchoColumna: Math.max(
      280,
      Math.min(720, Number(guardados.anchoColumna) || porDefecto.anchoColumna),
    ),
    filtrosLocales,
    estadoColumnas,
    espaciosTrabajo,
    espacioActivo,
  };
}

function guardarAjustesReconocidos(ajustes) {
  if (!ajustes || typeof ajustes !== 'object') return ajustesDeUsuario();

  const booleanos = ['mostrarBarraHerramientas', 'cabecerasPlegadas', 'cosechaPausada'];
  for (const clave of booleanos) {
    if (typeof ajustes[clave] === 'boolean') {
      consultas.guardarAjuste(clave, ajustes[clave] ? '1' : '0');
    }
  }

  let modsRecibidos = ajustes.modsX;
  if (modsRecibidos === undefined && typeof ajustes.autoMostrarPostsNuevos === 'boolean') {
    modsRecibidos = { autoMostrarPosts: ajustes.autoMostrarPostsNuevos };
  }
  if (modsRecibidos !== undefined) {
    const actuales = ajustesDeUsuario().modsX;
    const parcial =
      modsRecibidos && typeof modsRecibidos === 'object' && !Array.isArray(modsRecibidos)
        ? modsRecibidos
        : {};
    consultas.guardarAjuste(
      'modsX',
      JSON.stringify(normalizarModsX({ ...actuales, ...parcial }, actuales)),
    );
  }

  if (['compacta', 'comoda'].includes(ajustes.densidad)) {
    consultas.guardarAjuste('densidad', ajustes.densidad);
  }
  if (Number.isFinite(Number(ajustes.anchoColumna))) {
    const ancho = Math.max(280, Math.min(720, Number(ajustes.anchoColumna)));
    consultas.guardarAjuste('anchoColumna', String(ancho));
  }
  if (ajustes.filtrosLocales !== undefined) {
    consultas.guardarAjuste('filtrosLocales', JSON.stringify(normalizarFiltrosLocales(ajustes.filtrosLocales)));
  }
  if (ajustes.estadoColumnas !== undefined) {
    consultas.guardarAjuste('estadoColumnas', JSON.stringify(normalizarEstadoColumnas(ajustes.estadoColumnas)));
  }
  if (ajustes.espaciosTrabajo !== undefined) {
    consultas.guardarAjuste('espaciosTrabajo', JSON.stringify(normalizarEspacios(ajustes.espaciosTrabajo)));
  }
  if (ajustes.espacioActivo === null || typeof ajustes.espacioActivo === 'string') {
    consultas.guardarAjuste('espacioActivo', ajustes.espacioActivo ?? '');
  }

  return ajustesDeUsuario();
}

function normalizarColumnasImportadas(valor) {
  if (!Array.isArray(valor) || valor.length > 100) {
    throw new Error('El archivo no contiene una lista valida de columnas.');
  }

  const ids = new Set();
  return valor.map((columna, indice) => {
    if (!columna || typeof columna !== 'object' || !TIPOS_COLUMNA.has(columna.tipo)) {
      throw new Error(`La columna ${indice + 1} no es valida.`);
    }
    let id = Number(columna.id);
    if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) id = indice + 1;
    while (ids.has(id)) id++;
    ids.add(id);

    const titulo = String(columna.titulo ?? '').trim().slice(0, 100);
    if (!titulo) throw new Error(`La columna ${indice + 1} no tiene titulo.`);
    return {
      id,
      titulo,
      tipo: columna.tipo,
      fuente: String(columna.fuente ?? '').slice(0, 500),
      vivo: columna.tipo !== 'saved' && columna.vivo === true,
      filtros:
        columna.filtros && typeof columna.filtros === 'object' && !Array.isArray(columna.filtros)
          ? columna.filtros
          : {},
    };
  });
}

/**
 * @param {() => void} alCambiarColumnas Se llama cuando hay que reconfigurar los cosechadores
 */
function registrarIpc(alCambiarColumnas, alPausarCosecha = async () => {}) {
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

  ipcMain.handle(CANALES.COLUMNAS_GUARDAR_LOTE, async (_evento, columnas) => {
    if (!Array.isArray(columnas) || columnas.length === 0 || columnas.length > 100) {
      throw new Error('El espacio debe contener entre 1 y 100 columnas.');
    }

    // Primero se valida todo. Así una fuente incorrecta no deja medio lote
    // guardado antes de mostrar el error al usuario.
    const definiciones = columnas.map(normalizarDefinicionColumna);
    const existentes = new Set(consultas.listarColumnas().map((columna) => columna.id));
    const repetidos = new Set();

    for (const definicion of definiciones) {
      if (definicion.id === null) continue;
      if (!existentes.has(definicion.id)) {
        throw new Error(`La columna “${definicion.titulo}” ya no existe.`);
      }
      if (repetidos.has(definicion.id)) {
        throw new Error(`La columna “${definicion.titulo}” está repetida.`);
      }
      repetidos.add(definicion.id);
    }

    const resultado = definiciones.map((definicion) => {
      let id = definicion.id;
      if (id === null) id = consultas.crearColumna(definicion);
      else consultas.actualizarColumna(id, definicion);
      return { clave: definicion.clave, id };
    });

    await alCambiarColumnas();
    return resultado;
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

  ipcMain.handle(CANALES.TWEETS_DE_COLUMNA, (_evento, datos) => {
    const columnaId = datos && typeof datos === 'object' ? datos.id : datos;
    const orden = ORDENES_LOCALES.has(datos?.orden) ? datos.orden : 'recientes';
    return consultas.tweetsDeColumna(columnaId, AJUSTES.TWEETS_POR_COLUMNA, orden);
  });

  ipcMain.handle(CANALES.TWEETS_GUARDADOS, (_evento, datos) => {
    const orden = ORDENES_LOCALES.has(datos?.orden) ? datos.orden : 'recientes';
    return consultas.tweetsGuardados(AJUSTES.TWEETS_POR_COLUMNA, orden);
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
    const guardados = guardarAjustesReconocidos(ajustes);
    if (ajustes?.modsX !== undefined || typeof ajustes?.autoMostrarPostsNuevos === 'boolean') {
      configurarModsVentanaX(guardados.modsX);
    }
    return guardados;
  });

  ipcMain.handle(CANALES.COSECHA_PAUSAR, async (_evento, pausada) => {
    if (typeof pausada !== 'boolean') throw new Error('Estado de pausa invalido.');
    guardarAjustesReconocidos({ cosechaPausada: pausada });
    await alPausarCosecha(pausada);
    return { pausada };
  });

  ipcMain.handle(CANALES.CONFIG_EXPORTAR, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar configuracion de X-Electron',
      defaultPath: 'x-electron-config.json',
      filters: [{ name: 'Configuracion JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, cancelado: true };

    const contenido = {
      formato: 'x-electron-config',
      version: 1,
      exportadoEn: new Date().toISOString(),
      columnas: consultas.listarColumnas(),
      ajustes: ajustesDeUsuario(),
    };
    fs.writeFileSync(filePath, JSON.stringify(contenido, null, 2), 'utf8');
    return { ok: true, ruta: filePath };
  });

  ipcMain.handle(CANALES.CONFIG_IMPORTAR, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Importar configuracion de X-Electron',
      properties: ['openFile'],
      filters: [{ name: 'Configuracion JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths[0]) return { ok: false, cancelado: true };

    const textoArchivo = fs.readFileSync(filePaths[0], 'utf8');
    if (Buffer.byteLength(textoArchivo, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('El archivo de configuracion supera 2 MB.');
    }
    const contenido = JSON.parse(textoArchivo);
    if (contenido.formato !== 'x-electron-config') {
      throw new Error('El archivo no es una configuracion de X-Electron.');
    }

    const columnas = normalizarColumnasImportadas(contenido.columnas);
    const confirmacion = await dialog.showMessageBox({
      type: 'warning',
      title: 'Reemplazar configuracion',
      message: 'La importacion reemplazara las columnas actuales.',
      detail: 'Los tweets guardados se conservan, pero las columnas volveran a llenarse con la nueva configuracion.',
      buttons: ['Cancelar', 'Importar y reemplazar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmacion.response !== 1) return { ok: false, cancelado: true };

    consultas.reemplazarColumnas(columnas);
    const ajustes = guardarAjustesReconocidos(contenido.ajustes ?? {});
    configurarModsVentanaX(ajustes.modsX);
    await alPausarCosecha(ajustes.cosechaPausada);
    return { ok: true, columnas: conUrl(consultas.listarColumnas()), ajustes };
  });

  ipcMain.handle(CANALES.ESTADO_APP, async () => {
    return {
      sesionIniciada: await haySesionIniciada(),
      cosechaPausada: ajustesDeUsuario().cosechaPausada,
    };
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
    abrirVentanaX('https://x.com/home', () => alCambiarColumnas(), ajustesDeUsuario().modsX);
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

    abrirVentanaX('https://x.com/login', () => alCambiarColumnas(), ajustesDeUsuario().modsX);
  });

  // Abre una URL concreta de X en la ventana aparte. Se usa como respaldo al
  // abrir un tweet cuando no hay ninguna columna en vivo donde mostrarlo.
  ipcMain.handle(CANALES.X_ABRIR_URL, (_evento, url) => {
    if (typeof url === 'string' && /^https:\/\/x\.com\//.test(url)) {
      abrirVentanaX(url, () => alCambiarColumnas(), ajustesDeUsuario().modsX);
    }
  });
}

module.exports = {
  registrarIpc,
  ajustesDeUsuario,
  guardarAjustesReconocidos,
  normalizarColumnasImportadas,
};
