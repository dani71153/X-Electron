// Reconocimiento REAL de listas. Carga las dos URLs y para cada respuesta
// GraphQL apunta: operación, tamaño, cuántos "__typename":"List" trae, y cuántas
// listas saca NUESTRO parser. Guarda muestras de las que traen listas.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session } = require('electron');
const { extraerListas } = require('../src/main/parse/list');

const LOG = path.join(__dirname, 'recon-out.txt');
fs.writeFileSync(LOG, '');
const paso = (t) => fs.appendFileSync(LOG, t + '\n');

async function reconocer(url, etiqueta) {
  paso('\n===== ' + etiqueta + '  (' + url + ') =====');
  const v = new BrowserWindow({
    show: false, width: 1200, height: 900,
    webPreferences: {
      partition: 'persist:x',
      preload: path.join(__dirname, '..', 'src', 'preload', 'x-inject.js'),
      contextIsolation: true, sandbox: true,
    },
  });
  const dbg = v.webContents.debugger;
  dbg.attach('1.3');
  const pend = new Map();

  dbg.on('message', async (_e, metodo, params) => {
    if (metodo === 'Network.responseReceived') {
      const u = params.response?.url ?? '';
      if (u.includes('/i/api/graphql/')) pend.set(params.requestId, u);
      return;
    }
    if (metodo !== 'Network.loadingFinished') return;
    const u = pend.get(params.requestId);
    if (!u) return;
    pend.delete(params.requestId);
    const op = u.split('/i/api/graphql/')[1].split('?')[0].split('/')[1];
    try {
      const r = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
      const texto = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
      const nType = (texto.match(/"__typename":"List"/g) || []).length;
      let nParser = 0;
      try { nParser = extraerListas(JSON.parse(texto)).length; } catch {}
      if (nType > 0 || nParser > 0 || /list/i.test(op)) {
        paso(`  ${op}  bytes=${texto.length}  typenameList=${nType}  parser=${nParser}`);
      }
      if (nType > 0 && !fs.existsSync(path.join(__dirname, `real-${op}.json`))) {
        fs.writeFileSync(path.join(__dirname, `real-${op}.json`), texto);
        paso(`    -> muestra: real-${op}.json`);
      }
    } catch {}
  });

  dbg.sendCommand('Network.enable');
  await v.loadURL(url).catch((e) => paso('  loadURL error: ' + e.message));
  await new Promise((r) => setTimeout(r, 12000));
  paso('  URL final: ' + v.webContents.getURL());
  dbg.detach();
  v.destroy();
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('persist:x');
  const cookies = await ses.cookies.get({});
  const log = cookies.some((c) => c.name === 'auth_token') && cookies.some((c) => c.name === 'ct0');
  paso('sesion iniciada: ' + log);
  if (!log) { paso('SIN SESION'); app.exit(0); return; }

  await reconocer('https://x.com/i/lists', 'i/lists');
  await reconocer('https://x.com/Dna7115/lists', 'perfil/lists');

  paso('\nFIN');
  app.exit(0);
});

setTimeout(() => { paso('TIMEOUT'); app.exit(1); }, 45000);
