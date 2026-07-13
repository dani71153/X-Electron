// Abre la base de datos SQLite y ejecuta el esquema.
//
// Usamos node:sqlite, que viene incluido en el Node que trae Electron.
// Asi evitamos better-sqlite3, que necesita compilarse con Visual Studio.

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let db = null;

/**
 * Abre la base de datos y crea las tablas si no existen.
 * @param {string} carpetaDatos Normalmente app.getPath('userData')
 */
function abrirBaseDeDatos(carpetaDatos) {
  if (db) return db;

  fs.mkdirSync(carpetaDatos, { recursive: true });
  const rutaDb = path.join(carpetaDatos, 'x-electron.db');

  db = new DatabaseSync(rutaDb);

  // WAL permite leer mientras se escribe. Importante porque los cosechadores
  // escriben mientras el renderer lee.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  const esquema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(esquema);

  migrar(db);

  console.log('[db] abierta en', rutaDb);
  return db;
}

/**
 * Cambios de esquema para bases de datos que ya existian.
 * CREATE IF NOT EXISTS no añade columnas nuevas a una tabla que ya estaba, asi
 * que las columnas nuevas se agregan aqui, comprobando antes que no existan.
 */
function migrar(db) {
  const columnas = db.prepare('PRAGMA table_info(columns)').all();
  const nombres = new Set(columnas.map((c) => c.name));

  // 'live' marca una columna que se muestra en vivo (webview) en vez de cosecharse.
  if (!nombres.has('live')) {
    db.exec('ALTER TABLE columns ADD COLUMN live INTEGER NOT NULL DEFAULT 0');
    console.log('[db] migracion: columna "live" añadida');
  }

  // 'saved' marca un tweet que el usuario ha guardado localmente (favorito local).
  const cols = db.prepare('PRAGMA table_info(tweets)').all();
  if (!cols.some((c) => c.name === 'saved')) {
    db.exec('ALTER TABLE tweets ADD COLUMN saved INTEGER NOT NULL DEFAULT 0');
    console.log('[db] migracion: columna "saved" en tweets añadida');
  }
}

function obtenerBaseDeDatos() {
  if (!db) throw new Error('La base de datos no esta abierta. Llama a abrirBaseDeDatos primero.');
  return db;
}

function cerrarBaseDeDatos() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { abrirBaseDeDatos, obtenerBaseDeDatos, cerrarBaseDeDatos };
