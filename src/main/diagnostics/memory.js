// Diagnostico optativo de memoria por proceso de Electron/Chromium.
// Se activa con --log-memory para no llenar la consola durante el uso normal.

const { app, BrowserWindow, webContents } = require('electron');

function kbAMb(valor) {
  if (!Number.isFinite(valor)) return 0;
  return Math.round((valor / 1024) * 10) / 10;
}

function redondear(valor) {
  if (!Number.isFinite(valor)) return 0;
  return Math.round(valor * 10) / 10;
}

function contenidosPorProceso() {
  const porPid = new Map();

  for (const contenido of webContents.getAllWebContents()) {
    if (contenido.isDestroyed()) continue;

    try {
      const pid = contenido.getOSProcessId();
      const url = contenido.getURL();
      const etiqueta = url ? `${contenido.getType()}: ${url}` : contenido.getType();
      if (!porPid.has(pid)) porPid.set(pid, new Set());
      porPid.get(pid).add(etiqueta);
    } catch {
      // El renderer pudo terminar entre getAllWebContents() y la lectura.
    }
  }

  return porPid;
}

function tomarMuestraMemoria() {
  const etiquetas = contenidosPorProceso();
  const filas = app.getAppMetrics().map((metrica) => ({
    pid: metrica.pid,
    tipo: metrica.type,
    privadaMB: kbAMb(metrica.memory?.privateBytes),
    ramMB: kbAMb(metrica.memory?.workingSetSize),
    cpuPct: redondear(metrica.cpu?.percentCPUUsage),
    contenido: [...(etiquetas.get(metrica.pid) ?? [])].join(' | '),
  }));

  // privateBytes no cuenta dos veces las paginas compartidas y es la suma mas
  // util para comparar el impacto de abrir/cerrar cosechadores en Windows.
  const privadaTotal = redondear(filas.reduce((total, fila) => total + fila.privadaMB, 0));
  console.log(`[memoria] ${new Date().toISOString()} privada total: ${privadaTotal} MB`);
  console.table(filas);

  return filas;
}

/**
 * Version corta de la muestra, para el visor de la barra de estado.
 *
 * Usa privateBytes por el mismo motivo que tomarMuestraMemoria: no cuenta dos
 * veces las paginas compartidas, asi que el numero sube y baja de verdad al
 * abrir y cerrar cosechadores.
 *
 * "ventanas" incluye el tablero, la ventana visible de X si esta abierta y los
 * cosechadores ocultos: es justo lo que interesa vigilar.
 */
function resumenMemoria() {
  const privadaTotal = app
    .getAppMetrics()
    .reduce((total, metrica) => total + kbAMb(metrica.memory?.privateBytes), 0);

  return {
    ramMb: Math.round(privadaTotal),
    ventanas: BrowserWindow.getAllWindows().length,
  };
}

function iniciarMonitorMemoria(intervaloMs = 15000) {
  tomarMuestraMemoria();
  const temporizador = setInterval(tomarMuestraMemoria, intervaloMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}

module.exports = { iniciarMonitorMemoria, tomarMuestraMemoria, resumenMemoria };
