// Cosechadores: ventanas ocultas de X cuya unica funcion es provocar que X pida
// datos a su propia API. El interceptor copia esas respuestas y las guardamos.
//
// Las columnas que ve el usuario NO son estas ventanas. Son HTML nuestro pintado
// desde la base de datos. Estas ventanas solo generan el trafico.
//
// REGLAS PARA NO QUE X NO NOS BLOQUEE:
// 1. Las ventanas se reutilizan. Recargar la pagina dispara una rafaga de
//    peticiones, asi que solo se recarga cada RECARGA_MS.
// 2. Solo se cosecha una columna a la vez, en un bucle secuencial. Nunca hay
//    dos ciclos solapados.
// 3. Todas las esperas llevan jitter. Los intervalos exactos delatan a un robot.
// 4. Si X responde 429 o 403, paramos y esperamos con backoff exponencial.

const path = require('path');
const { BrowserWindow } = require('electron');
const { AJUSTES } = require('../../../config/settings');
const { engancharInterceptor } = require('../capture/interceptor');
const { haySesionIniciada } = require('../session');
const { extraerTimeline } = require('../parse/timeline');
const { conJitter, esperar } = require('./tiempo');
const consultas = require('../db/queries');

/** Construye la URL de X que hay que visitar para alimentar una columna. */
function urlDeColumna(columna) {
  const fuente = encodeURIComponent(columna.fuente ?? '');

  switch (columna.tipo) {
    case 'saved':
      // Columna de guardados: se pinta desde la BD, no tiene URL de X.
      return null;
    case 'home':
      return 'https://x.com/home';
    case 'notifications':
      return 'https://x.com/notifications';
    case 'list':
      return `https://x.com/i/lists/${fuente}`;
    case 'user':
      return `https://x.com/${fuente}`;
    case 'search': {
      // El orden lo elige el usuario y se guarda en la columna (filtros.orden).
      // f= : 'live' recientes, 'user' personas, 'media' multimedia. Sin f = Top.
      const orden = columna.filtros?.orden ?? 'live';
      const f = orden === 'top' ? '' : `&f=${orden}`;
      return `https://x.com/search?q=${fuente}${f}`;
    }
    default:
      throw new Error(`Tipo de columna desconocido: ${columna.tipo}`);
  }
}

/** ¿X nos ha mandado a la pantalla de login? */
function esUrlDeLogin(url) {
  return url.includes('/login') || url.includes('/i/flow');
}

class Cosechador {
  /**
   * @param {object} columna
   * @param {(columnaId: number, nuevos: number) => void} alGuardar
   * @param {(datos: {status: number}) => void} alFrenar
   */
  constructor(columna, alGuardar, alFrenar) {
    this.columna = columna;
    this.alGuardar = alGuardar;
    this.alFrenar = alFrenar;

    this.ventana = null;
    this.desenganchar = null;
    this.cargadaEn = 0; // cuando se cargo la pagina por ultima vez
    this.sesionInvalida = false;
    this.ultimoUsoEn = 0;
  }

  /** Crea la ventana si no existe. No carga nada todavia. */
  asegurarVentana() {
    if (this.ventana && !this.ventana.isDestroyed()) return;

    this.ventana = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        partition: AJUSTES.PARTICION_SESION,
        // Desactiva las passkeys. Sin esto, si X manda al login, salta el
        // dialogo de Windows Hello desde una ventana invisible.
        preload: path.join(__dirname, '..', '..', 'preload', 'x-inject.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Se activa solo mientras esta columna se cosecha. El resto del tiempo
        // Chromium puede frenar timers y trabajo grafico de esta ventana oculta.
        backgroundThrottling: true,
      },
    });

    this.desenganchar = engancharInterceptor(this.ventana.webContents, {
      alRecibirTimeline: (datos) => this.guardarTimeline(datos),
      alFrenar: (datos) => this.alFrenar(datos),
      bloquearRecursosPesados: true,
    });
  }

  tieneVentanaViva() {
    return Boolean(this.ventana && !this.ventana.isDestroyed());
  }

  /** Despierta Chromium solo durante el trabajo efectivo de esta columna. */
  activar() {
    if (!this.tieneVentanaViva()) return;
    this.ventana.webContents.setBackgroundThrottling(false);
  }

  /** Permite que Chromium reduzca timers, pintura y uso de CPU/RAM en espera. */
  hibernar() {
    if (!this.tieneVentanaViva()) return;
    this.ultimoUsoEn = Date.now();
    this.ventana.webContents.setBackgroundThrottling(true);
  }

  /** ¿Hay que volver a cargar la pagina, o vale con la que ya esta? */
  necesitaCargar() {
    if (this.cargadaEn === 0) return true;
    return Date.now() - this.cargadaEn > AJUSTES.RECARGA_MS;
  }

  async cargar() {
    const url = urlDeColumna(this.columna);

    try {
      await this.ventana.loadURL(url);
    } catch (error) {
      // ERR_ABORTED es normal cuando X redirige a mitad de carga.
      console.warn(`[cosecha] "${this.columna.titulo}" no cargo:`, error.message);
      return false;
    }

    // La ventana pudo cerrarse DURANTE la carga: al reconfigurar la cosecha o al
    // cerrar la app, detener() llama a cerrar() y pone this.ventana en null. Si
    // no comprobamos aqui, la linea de abajo tocaria webContents sobre null y el
    // error, al salir de un `await` sin capturar, mataria el bucle de cosecha.
    if (!this.ventana || this.ventana.isDestroyed()) return false;

    this.cargadaEn = Date.now();

    const urlFinal = this.ventana.webContents.getURL();
    if (esUrlDeLogin(urlFinal)) {
      // Las cookies estaban, pero la sesion ya no vale.
      console.warn('[cosecha] X nos ha mandado al login: la sesion no es valida.');
      this.sesionInvalida = true;
      return false;
    }

    // X tarda un poco en pintar el timeline despues de que la pagina "termine".
    await esperar(conJitter(4000));
    return true;
  }

  /** ¿La pagina ya esta en el fondo? Si lo esta, seguir bajando no pide nada nuevo. */
  async estaAlFinal() {
    try {
      return await this.ventana.webContents.executeJavaScript(
        'window.innerHeight + window.scrollY >= document.body.scrollHeight - 200',
      );
    } catch {
      return true; // la ventana se esta cerrando
    }
  }

  async bajar() {
    try {
      await this.ventana.webContents.executeJavaScript(
        `window.scrollBy(0, ${AJUSTES.PIXELES_SCROLL});`,
      );
    } catch {
      /* la ventana se esta cerrando */
    }
  }

  async volverArriba() {
    try {
      await this.ventana.webContents.executeJavaScript('window.scrollTo(0, 0);');
    } catch {
      /* la ventana se esta cerrando */
    }
  }

  /**
   * Un ciclo de cosecha: carga si toca, baja unas cuantas veces y vuelve arriba.
   * Al volver arriba, X refresca el timeline solo en el siguiente ciclo.
   */
  async ciclo() {
    this.asegurarVentana();
    this.activar();

    try {
      if (this.necesitaCargar()) {
        const cargo = await this.cargar();
        if (!cargo) return;
      }

      for (let i = 0; i < AJUSTES.SCROLLS_POR_CICLO; i++) {
        if (!this.ventana || this.ventana.isDestroyed()) return;

        // Si ya no hay mas contenido, insistir solo genera peticiones inutiles.
        if (await this.estaAlFinal()) break;

        await this.bajar();
        await esperar(conJitter(AJUSTES.INTERVALO_SCROLL_MS));
      }

      await this.volverArriba();
    } finally {
      this.hibernar();
    }
  }

  cerrar() {
    if (this.desenganchar) {
      this.desenganchar();
      this.desenganchar = null;
    }
    if (this.ventana && !this.ventana.isDestroyed()) {
      this.ventana.destroy();
    }
    this.ventana = null;
    this.cargadaEn = 0;
  }

  guardarTimeline({ operacion, json }) {
    const { tweets, autores } = extraerTimeline(json);
    if (tweets.length === 0) return;

    for (const autor of autores) {
      consultas.guardarUsuario(autor);
    }

    let nuevos = 0;
    let enColumna = 0;

    for (const tweet of tweets) {
      const { crudo, esDeColumna, ...limpio } = tweet;

      if (consultas.guardarTweet(limpio, crudo)) nuevos++;

      // Solo se vinculan a la columna los tweets que de verdad aparecian en ese
      // timeline. Los tweets citados se guardan, pero no ensucian la columna.
      if (esDeColumna) {
        consultas.vincularTweetAColumna(this.columna.id, limpio.id);
        enColumna++;
      }
    }

    console.log(
      `[cosecha] "${this.columna.titulo}" (${operacion}): ` +
        `${enColumna} en columna, ${nuevos} nuevos, ${tweets.length} guardados`,
    );

    if (this.alGuardar) this.alGuardar(this.columna.id, nuevos);
  }
}

/**
 * Recorre las columnas una a una, en un bucle secuencial.
 *
 * Es un bucle `while` con `await`, no un setInterval. Asi es imposible que dos
 * ciclos se solapen: la version anterior usaba setInterval sobre una funcion
 * async y acababa dejando temporizadores y ventanas huerfanas cosechando para
 * siempre.
 */
class GestorDeCosecha {
  /**
   * @param {(columnaId: number, nuevos: number) => void} alGuardar
   * @param {(sesionIniciada: boolean) => void} alCambiarSesion
   * @param {(columnaId: number, estado: {fase: string, actualizadaEn?: number}) => void} [alEstadoColumna]
   */
  constructor(alGuardar, alCambiarSesion, alEstadoColumna = () => {}) {
    this.alGuardar = alGuardar;
    this.alCambiarSesion = alCambiarSesion;
    this.alEstadoColumna = alEstadoColumna;

    this.cosechadores = new Map(); // columnaId -> Cosechador

    // Cada vez que reconfiguramos subimos la generacion. El bucle viejo lo ve
    // en su siguiente pausa y se retira solo, sin que nadie tenga que esperarlo.
    // Asi `configurar` responde al instante y nunca hay dos bucles a la vez.
    this.generacion = 0;

    this.esperaHasta = 0; // timestamp: no cosechar hasta este momento
    this.backoffMs = 0;
  }

  /** Reinicia la cosecha con la lista de columnas actual. */
  async configurar(columnas) {
    this.detener();

    // Se captura ANTES del await. Si otro `configurar` entra mientras
    // comprobamos la sesion, subira la generacion y este se retirara.
    // Leerla despues del await dejaria arrancar dos bucles con la misma.
    const generacion = this.generacion;

    if (columnas.length === 0) return;

    // Sin sesion no se cosecha NADA. Si lo hicieramos, X mandaria cada
    // cosechador a la pantalla de login, que pide passkey al cargar.
    const sesion = await haySesionIniciada();
    if (!this.esVigente(generacion)) return; // otro configurar tomo el relevo

    if (!sesion) {
      console.log('[cosecha] sin sesion iniciada: no se cosecha. Abre X.com y entra.');
      this.alCambiarSesion(false);
      return;
    }

    // La sesion es valida: avisamos siempre, aunque todo sean columnas en vivo
    // (asi la interfaz oculta el aviso de "inicia sesion").
    this.alCambiarSesion(true);

    // No se cosechan: las en vivo (webview) ni las de guardados (salen de la BD).
    for (const columna of columnas) {
      if (columna.vivo || columna.tipo === 'saved') continue;
      this.cosechadores.set(
        columna.id,
        new Cosechador(columna, this.alGuardar, (datos) => this.frenar(datos)),
      );
    }

    if (this.cosechadores.size === 0) return; // todo eran columnas en vivo

    // A proposito sin await: corre en segundo plano. El .catch es la red de
    // seguridad: si el bucle muere por un error imprevisto, sin esto la cosecha
    // se pararia en silencio (solo se veria en el manejador global de promesas).
    // Asi queda claro en el log que la cosecha ha parado y por que.
    //
    // NO reintentamos solos a proposito: si el fallo se repite en cada vuelta,
    // reintentar seria un bucle de crashes. Para reanudar: reinicia la app o
    // reconfigura las columnas (crear/borrar una columna llama a configurar()).
    this.bucle(generacion).catch((error) => {
      console.error('[cosecha] el bucle ha muerto por un error imprevisto:', error);
    });
  }

  /** ¿Sigue siendo este bucle el vigente? */
  esVigente(generacion) {
    return generacion === this.generacion;
  }

  /** Espera, pero se corta en cuanto el bucle deja de ser el vigente. */
  async dormir(generacion, ms) {
    const fin = Date.now() + ms;
    while (this.esVigente(generacion) && Date.now() < fin) {
      await esperar(Math.min(250, fin - Date.now()));
    }
  }

  /** X nos ha dicho que paremos. Esperamos, doblando la espera cada vez. */
  frenar({ status }) {
    this.backoffMs =
      this.backoffMs === 0
        ? AJUSTES.BACKOFF_INICIAL_MS
        : Math.min(this.backoffMs * 2, AJUSTES.BACKOFF_MAX_MS);

    this.esperaHasta = Date.now() + this.backoffMs;

    console.warn(`[cosecha] X respondio ${status}. Parando ${Math.round(this.backoffMs / 1000)}s.`);
  }

  /** Una respuesta buena: X ya no nos frena, olvidamos el backoff. */
  exito() {
    this.backoffMs = 0;
  }

  async bucle(generacion) {
    while (this.esVigente(generacion)) {
      // ¿Nos estan frenando? Esperamos sin pedir nada.
      if (Date.now() < this.esperaHasta) {
        await this.dormir(generacion, Math.min(this.esperaHasta - Date.now(), 30000));
        continue;
      }

      if (!(await haySesionIniciada())) {
        console.log('[cosecha] se ha perdido la sesion: parando.');
        if (this.esVigente(generacion)) {
          this.detener();
          this.alCambiarSesion(false);
        }
        return;
      }

      for (const [columnaId, cosechador] of this.cosechadores) {
        if (!this.esVigente(generacion)) return;
        if (Date.now() < this.esperaHasta) break;

        // Avisamos a la interfaz de que esta columna se esta actualizando ahora.
        this.alEstadoColumna(columnaId, { fase: 'cosechando' });

        // El limite se aplica ANTES de abrir otra ventana. Antes se comprobaba
        // al final de la vuelta, cuando el pico ya podia ser una por columna.
        this.asegurarCapacidadPara(cosechador);
        await cosechador.ciclo();
        if (!this.esVigente(generacion)) return;

        if (cosechador.sesionInvalida) {
          console.log('[cosecha] la sesion ya no es valida: parando.');
          this.detener();
          this.alCambiarSesion(false);
          return;
        }

        // Y de que ya termino, con la hora exacta para el "actualizada hace X".
        this.alEstadoColumna(columnaId, { fase: 'ok', actualizadaEn: Date.now() });

        this.exito();
        this.liberarVentanaRotatoria(cosechador);
        await this.dormir(generacion, conJitter(AJUSTES.PAUSA_ENTRE_COLUMNAS_MS));
      }

      this.cerrarVentanasSobrantes();
      await this.dormir(generacion, conJitter(AJUSTES.CICLO_MS));
    }
  }

  /**
   * Conserva calientes hasta MAX-1 columnas y deja una plaza rotatoria para el
   * resto. Asi nunca superamos el limite y tampoco recargamos todas las paginas
   * en cada vuelta (lo que aumentaria las rafagas de peticiones a X).
   */
  cosechadoresPersistentes() {
    const maximo = Math.max(1, AJUSTES.MAX_VENTANAS_VIVAS);
    const cantidad = this.cosechadores.size <= maximo ? this.cosechadores.size : maximo - 1;
    return new Set([...this.cosechadores.values()].slice(0, cantidad));
  }

  asegurarCapacidadPara(objetivo) {
    if (objetivo.tieneVentanaViva()) return;

    const maximo = Math.max(1, AJUSTES.MAX_VENTANAS_VIVAS);
    const vivos = [...this.cosechadores.values()].filter((c) => c.tieneVentanaViva());
    if (vivos.length < maximo) return;

    const persistentes = this.cosechadoresPersistentes();
    const candidato =
      vivos.find((c) => c !== objetivo && !persistentes.has(c)) ??
      [...vivos]
        .filter((c) => c !== objetivo)
        .sort((a, b) => a.ultimoUsoEn - b.ultimoUsoEn)[0];

    if (candidato) candidato.cerrar();
  }

  liberarVentanaRotatoria(cosechador) {
    const maximo = Math.max(1, AJUSTES.MAX_VENTANAS_VIVAS);
    if (this.cosechadores.size <= maximo) return;
    if (!this.cosechadoresPersistentes().has(cosechador)) cosechador.cerrar();
  }

  /** Si hay mas ventanas vivas de la cuenta, cierra las de las ultimas columnas. */
  cerrarVentanasSobrantes() {
    const maximo = Math.max(1, AJUSTES.MAX_VENTANAS_VIVAS);
    const vivos = [...this.cosechadores.values()].filter((c) => c.tieneVentanaViva());

    for (let i = maximo; i < vivos.length; i++) {
      vivos[i].cerrar();
    }
  }

  /** Invalida el bucle actual y cierra todas las ventanas. */
  detener() {
    this.generacion++;

    for (const cosechador of this.cosechadores.values()) cosechador.cerrar();
    this.cosechadores.clear();

    this.esperaHasta = 0;
    this.backoffMs = 0;
  }
}

module.exports = { GestorDeCosecha, Cosechador, urlDeColumna };
