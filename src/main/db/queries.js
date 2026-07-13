// Todas las consultas SQL viven aqui. El resto de la app no escribe SQL.

const { obtenerBaseDeDatos } = require('./database');

// node:sqlite solo acepta null, number, bigint, string y Uint8Array como parametros.
// Estos ayudantes evitan errores por undefined o booleanos.
const texto = (v) => (v === undefined || v === null ? null : String(v));
const entero = (v) => (v === undefined || v === null ? 0 : Number(v));
const bool = (v) => (v ? 1 : 0);

// ---------- Usuarios ----------

function guardarUsuario(usuario) {
  const db = obtenerBaseDeDatos();
  db.prepare(`
    INSERT INTO users (id, handle, name, avatar_url, verified, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      handle = excluded.handle,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      verified = excluded.verified,
      updated_at = excluded.updated_at
  `).run(
    texto(usuario.id),
    texto(usuario.handle),
    texto(usuario.nombre),
    texto(usuario.avatarUrl),
    bool(usuario.verificado),
    Date.now(),
  );
}

// ---------- Tweets ----------

/** Guarda o actualiza un tweet. Devuelve true si es la primera vez que lo vemos. */
function guardarTweet(tweet, rawJson) {
  const db = obtenerBaseDeDatos();

  const yaExiste = db.prepare('SELECT 1 FROM tweets WHERE id = ?').get(texto(tweet.id));

  db.prepare(`
    INSERT INTO tweets (id, author_id, text, created_at, reply_to_id, quoted_id,
                        metrics_json, media_json, raw_json, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      text = excluded.text,
      metrics_json = excluded.metrics_json,
      media_json = excluded.media_json,
      raw_json = excluded.raw_json
  `).run(
    texto(tweet.id),
    texto(tweet.autorId),
    texto(tweet.texto) ?? '',
    entero(tweet.creadoEn),
    texto(tweet.respuestaA),
    texto(tweet.citaDe),
    JSON.stringify(tweet.metricas ?? {}),
    JSON.stringify(tweet.media ?? []),
    rawJson ? JSON.stringify(rawJson) : null,
    Date.now(),
  );

  return !yaExiste;
}

/** Marca que un tweet aparecio en una columna. */
function vincularTweetAColumna(columnaId, tweetId) {
  const db = obtenerBaseDeDatos();
  db.prepare(`
    INSERT INTO column_tweets (column_id, tweet_id, seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(column_id, tweet_id) DO NOTHING
  `).run(entero(columnaId), texto(tweetId), Date.now());
}

// Columnas que pedimos siempre al leer tweets, para no repetir el SELECT.
const CAMPOS_TWEET = `
  t.id, t.text, t.created_at, t.metrics_json, t.media_json,
  t.reply_to_id, t.quoted_id, t.saved,
  u.handle, u.name, u.avatar_url, u.verified
`;

/** Convierte una fila SQL en el objeto tweet que espera la interfaz. */
function mapearFilaTweet(f) {
  return {
    id: f.id,
    texto: f.text,
    creadoEn: f.created_at,
    respuestaA: f.reply_to_id,
    citaDe: f.quoted_id,
    guardado: f.saved === 1,
    // Enlace permanente para abrirlo en el webview. Necesita el handle del autor.
    enlace: f.handle ? `https://x.com/${f.handle}/status/${f.id}` : null,
    metricas: JSON.parse(f.metrics_json),
    media: JSON.parse(f.media_json),
    autor: {
      handle: f.handle ?? 'desconocido',
      nombre: f.name ?? 'Desconocido',
      avatarUrl: f.avatar_url ?? '',
      verificado: f.verified === 1,
    },
  };
}

/** Devuelve los tweets de una columna, mas recientes primero, ya con su autor. */
function tweetsDeColumna(columnaId, limite = 100) {
  const db = obtenerBaseDeDatos();
  const filas = db.prepare(`
    SELECT ${CAMPOS_TWEET}
    FROM column_tweets ct
    JOIN tweets t ON t.id = ct.tweet_id
    LEFT JOIN users u ON u.id = t.author_id
    WHERE ct.column_id = ?
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(entero(columnaId), entero(limite));

  return filas.map(mapearFilaTweet);
}

/** Los tweets guardados localmente, mas recientes primero. */
function tweetsGuardados(limite = 200) {
  const db = obtenerBaseDeDatos();
  const filas = db.prepare(`
    SELECT ${CAMPOS_TWEET}
    FROM tweets t
    LEFT JOIN users u ON u.id = t.author_id
    WHERE t.saved = 1
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(entero(limite));

  return filas.map(mapearFilaTweet);
}

/** Marca o desmarca un tweet como guardado. */
function marcarGuardado(tweetId, guardado) {
  const db = obtenerBaseDeDatos();
  db.prepare('UPDATE tweets SET saved = ? WHERE id = ?').run(bool(guardado), texto(tweetId));
}

/** Devuelve el JSON crudo original de X para un tweet (para exportarlo). */
function rawDeTweet(tweetId) {
  const db = obtenerBaseDeDatos();
  const fila = db.prepare('SELECT raw_json FROM tweets WHERE id = ?').get(texto(tweetId));
  return fila?.raw_json ?? null;
}

// ---------- Columnas ----------

function listarColumnas() {
  const db = obtenerBaseDeDatos();
  const filas = db.prepare('SELECT * FROM columns ORDER BY position ASC, id ASC').all();
  return filas.map((f) => ({
    id: f.id,
    titulo: f.title,
    tipo: f.type,
    fuente: f.source,
    posicion: f.position,
    filtros: JSON.parse(f.filters_json),
    vivo: f.live === 1,
  }));
}

function crearColumna({ titulo, tipo, fuente = '', vivo = false, filtros = {} }) {
  const db = obtenerBaseDeDatos();
  const siguiente = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM columns').get();
  const info = db.prepare(`
    INSERT INTO columns (title, type, source, position, live, filters_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    texto(titulo),
    texto(tipo),
    texto(fuente) ?? '',
    entero(siguiente.p),
    bool(vivo),
    JSON.stringify(filtros ?? {}),
  );

  // lastInsertRowid puede venir como BigInt.
  return Number(info.lastInsertRowid);
}

function borrarColumna(columnaId) {
  const db = obtenerBaseDeDatos();
  db.prepare('DELETE FROM column_tweets WHERE column_id = ?').run(entero(columnaId));
  db.prepare('DELETE FROM columns WHERE id = ?').run(entero(columnaId));
}

function contarColumnas() {
  const db = obtenerBaseDeDatos();
  return db.prepare('SELECT COUNT(*) AS n FROM columns').get().n;
}

// ---------- Listas ----------

function guardarLista(lista) {
  const db = obtenerBaseDeDatos();
  db.prepare(`
    INSERT INTO lists (id, name, description, member_count, mode, banner_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      member_count = excluded.member_count,
      mode = excluded.mode,
      banner_url = excluded.banner_url,
      updated_at = excluded.updated_at
  `).run(
    texto(lista.id),
    texto(lista.nombre),
    texto(lista.descripcion) ?? '',
    entero(lista.miembros),
    texto(lista.modo) ?? 'public',
    texto(lista.bannerUrl) ?? '',
    Date.now(),
  );
}

function listarListas() {
  const db = obtenerBaseDeDatos();
  const filas = db.prepare('SELECT * FROM lists ORDER BY name COLLATE NOCASE ASC').all();
  return filas.map((f) => ({
    id: f.id,
    nombre: f.name,
    descripcion: f.description,
    miembros: f.member_count,
    modo: f.mode,
    bannerUrl: f.banner_url,
  }));
}

module.exports = {
  guardarUsuario,
  guardarTweet,
  vincularTweetAColumna,
  tweetsDeColumna,
  tweetsGuardados,
  marcarGuardado,
  rawDeTweet,
  listarColumnas,
  crearColumna,
  borrarColumna,
  contarColumnas,
  guardarLista,
  listarListas,
};
