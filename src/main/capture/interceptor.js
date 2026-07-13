// Copia las respuestas JSON que X ya le envia al navegador.
//
// POR QUE EL DEPURADOR Y NO session.webRequest:
// webRequest de Electron te deja ver las cabeceras de una respuesta, pero NO su
// cuerpo. Como lo que queremos es justo el cuerpo (el JSON con los tweets),
// usamos el protocolo de depuracion de Chrome (CDP), que si lo expone mediante
// Network.getResponseBody.
//
// No modificamos nada de la peticion: X funciona exactamente igual, nosotros
// solo nos quedamos con una copia de lo que ya viajaba.

const { esLlamadaGraphQL, esTimeline, esOperacionDeListas, nombreDeOperacion } = require('./endpoints');
const { AJUSTES } = require('../../../config/settings');

// Codigos con los que X nos esta diciendo que paremos.
// 429: demasiadas peticiones. 401/403: sesion invalida o bloqueada.
const CODIGOS_DE_FRENO = [401, 403, 429];

/**
 * Engancha el interceptor a un webContents.
 *
 * @param {Electron.WebContents} webContents
 * @param {object} manejadores
 * @param {(datos: {url: string, operacion: string, json: object}) => void} manejadores.alRecibirTimeline
 * @param {(datos: {status: number, operacion: string}) => void} manejadores.alFrenar
 * @param {(json: object) => void} [manejadores.alRecibirListas] Opcional: JSON con posibles listas
 * @returns {() => void} Funcion para desenganchar
 */
function engancharInterceptor(webContents, { alRecibirTimeline, alFrenar, alRecibirListas }) {
  const depurador = webContents.debugger;

  try {
    depurador.attach('1.3');
  } catch (error) {
    console.error('[interceptor] no se pudo enganchar el depurador:', error.message);
    return () => {};
  }

  // El evento que trae la URL y el que avisa de que el cuerpo esta listo son
  // distintos, asi que guardamos los datos por requestId hasta que llega el cuerpo.
  const peticiones = new Map();

  const alMensaje = async (_evento, metodo, params) => {
    if (metodo === 'Network.responseReceived') {
      const url = params.response?.url ?? '';
      if (esLlamadaGraphQL(url)) {
        peticiones.set(params.requestId, { url, status: params.response.status });
      }
      return;
    }

    if (metodo !== 'Network.loadingFinished') return;

    const peticion = peticiones.get(params.requestId);
    if (!peticion) return;
    peticiones.delete(params.requestId);

    const { url, status } = peticion;
    const operacion = nombreDeOperacion(url);

    // X nos esta frenando. Avisamos y no insistimos.
    if (CODIGOS_DE_FRENO.includes(status)) {
      console.warn(`[interceptor] X respondio ${status} a ${operacion}`);
      alFrenar({ status, operacion });
      return;
    }

    if (status >= 400) {
      console.warn(`[interceptor] ${operacion} respondio ${status}`);
      return;
    }

    const timeline = esTimeline(url);
    const listas = Boolean(alRecibirListas) && esOperacionDeListas(url);

    if (AJUSTES.LOG_ENDPOINTS) {
      console.log('[graphql]', operacion, timeline ? '<- timeline' : listas ? '<- listas' : '');
    }

    // Solo leemos el cuerpo si nos interesa (timeline o listas).
    if (!timeline && !listas) return;

    try {
      const respuesta = await depurador.sendCommand('Network.getResponseBody', {
        requestId: params.requestId,
      });

      const texto = respuesta.base64Encoded
        ? Buffer.from(respuesta.body, 'base64').toString('utf8')
        : respuesta.body;

      const json = JSON.parse(texto);

      // X a veces devuelve 200 con los errores dentro del cuerpo.
      // El codigo 88 es "rate limit exceeded".
      const errores = json.errors ?? [];
      if (errores.length > 0) {
        console.warn('[interceptor] errores en la respuesta:', errores.map((e) => e.message).join('; '));
        if (errores.some((e) => e.code === 88)) {
          alFrenar({ status: 429, operacion });
          return;
        }
      }

      if (timeline) alRecibirTimeline({ url, operacion, json });
      if (listas) alRecibirListas(json);
    } catch (error) {
      // Chrome descarta el cuerpo pasado un rato. Si llegamos tarde, lo perdemos
      // y ya esta: el siguiente ciclo lo volvera a pedir.
      console.warn('[interceptor] cuerpo no disponible:', error.message);
    }
  };

  depurador.on('message', alMensaje);
  depurador.sendCommand('Network.enable');

  return () => {
    depurador.removeListener('message', alMensaje);
    if (depurador.isAttached()) depurador.detach();
  };
}

module.exports = { engancharInterceptor };
