const fs = require('fs');
const { obtenerBaseDeDatos } = require('./database');

function ajustesAlmacenamiento() {
  const db = obtenerBaseDeDatos();
  const valor = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  const dias = Number(valor('limpiezaAutomaticaDias'));
  return {
    guardarPostsAutomaticamente: valor('guardarPostsAutomaticamente') !== '0',
    limpiezaAutomaticaDias: [7, 30, 90].includes(dias) ? dias : 0,
  };
}

function resumenAlmacenamiento() {
  const db = obtenerBaseDeDatos();
  const ruta = db.prepare('PRAGMA database_list').all().find((base) => base.name === 'main').file;
  const bytes = ['', '-wal', '-shm'].reduce((total, sufijo) => {
    try { return total + fs.statSync(ruta + sufijo).size; } catch { return total; }
  }, 0);
  return {
    ...ajustesAlmacenamiento(), bytes,
    ...db.prepare('SELECT COUNT(*) AS posts, SUM(saved = 1) AS guardados FROM tweets').get(),
    autores: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  };
}

function limpiarPublicaciones(dias) {
  if (![0, 7, 30, 90].includes(dias)) throw new Error('Plazo de limpieza no valido');
  const db = obtenerBaseDeDatos();
  const limite = dias === 0 ? Number.MAX_SAFE_INTEGER : Date.now() - dias * 86400000;
  let eliminados;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`DELETE FROM column_tweets WHERE tweet_id IN
      (SELECT id FROM tweets WHERE saved = 0 AND captured_at < ?)`).run(limite);
    eliminados = db.prepare('DELETE FROM tweets WHERE saved = 0 AND captured_at < ?').run(limite).changes;
    db.exec('DELETE FROM users WHERE NOT EXISTS (SELECT 1 FROM tweets WHERE tweets.author_id = users.id)');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  // DELETE por si solo deja el espacio reservado dentro del archivo SQLite.
  if (eliminados > 0) {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
  return { eliminados, ...resumenAlmacenamiento() };
}

function ejecutarLimpiezaAutomatica() {
  const { limpiezaAutomaticaDias } = ajustesAlmacenamiento();
  if (limpiezaAutomaticaDias) return limpiarPublicaciones(limpiezaAutomaticaDias);
}

module.exports = { ajustesAlmacenamiento, resumenAlmacenamiento, limpiarPublicaciones, ejecutarLimpiezaAutomatica };
