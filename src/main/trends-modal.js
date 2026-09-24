const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { AJUSTES } = require('../../config/settings');

const ventanas = new Map();

/** Una ventana modal por anfitrion, con la misma sesion que la vista de X. */
async function abrirBusquedaModal(evento, consulta) {
  const origen = new URL(evento.senderFrame?.url || 'about:blank');
  if (origen.protocol !== 'https:' || !['x.com', 'www.x.com'].includes(origen.hostname)
    || evento.senderFrame !== evento.sender.mainFrame) {
    throw new Error('Origen no permitido');
  }
  if (typeof consulta !== 'string' || !consulta.trim() || consulta.length > 2000) {
    throw new Error('Busqueda no valida');
  }
  const anfitrion = evento.sender.hostWebContents || evento.sender;
  const padre = BrowserWindow.fromWebContents(anfitrion);
  if (!padre || padre.isDestroyed()) throw new Error('La ventana ya no esta disponible');

  // Windows no siempre coloca las ventanas modales en el monitor del padre.
  // Todas estas coordenadas estan en DIP, tambien con escalas de pantalla distintas.
  const bounds = padre.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(1100, bounds.width, area.width);
  const height = Math.min(850, bounds.height, area.height);
  const posicion = {
    width,
    height,
    x: Math.max(area.x, Math.min(area.x + area.width - width,
      Math.round(bounds.x + (bounds.width - width) / 2))),
    y: Math.max(area.y, Math.min(area.y + area.height - height,
      Math.round(bounds.y + (bounds.height - height) / 2))),
  };

  let ventana = ventanas.get(padre.id);
  if (!ventana || ventana.isDestroyed()) {
    ventana = new BrowserWindow({
      parent: padre,
      modal: true,
      show: false,
      ...posicion,
      title: 'Busqueda de tendencia',
      autoHideMenuBar: true,
      webPreferences: {
        partition: AJUSTES.PARTICION_SESION,
        preload: path.join(__dirname, '..', 'preload', 'x-inject.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    ventanas.set(padre.id, ventana);
    ventana.once('closed', () => ventanas.delete(padre.id));
    ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    ventana.webContents.on('before-input-event', (ev, entrada) => {
      if (entrada.type === 'keyDown' && entrada.key === 'Escape') {
        ev.preventDefault();
        ventana.close();
      }
    });
  }
  // Recalcular tambien al reutilizarla, por si la app cambio de monitor.
  ventana.setBounds(posicion);
  ventana.show();
  ventana.focus();
  try {
    await ventana.loadURL(`https://x.com/search?q=${encodeURIComponent(consulta.trim())}&src=trend_click`);
  } catch (error) {
    if (!ventana.isDestroyed()) ventana.close();
    throw error;
  }
}

module.exports = { abrirBusquedaModal };
