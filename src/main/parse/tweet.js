// Convierte un tweet crudo de X en nuestro objeto Tweet.

const { normalizarUsuario } = require('./user');

/**
 * X a veces envuelve el tweet dentro de otro objeto para marcar avisos de
 * visibilidad. Esta funcion nos devuelve siempre el tweet de verdad.
 */
function desenvolverTweet(resultado) {
  if (!resultado) return null;
  if (resultado.__typename === 'TweetWithVisibilityResults') return resultado.tweet ?? null;
  if (resultado.__typename === 'TweetTombstone') return null; // tweet borrado o no visible
  return resultado;
}

/** Saca las imagenes y videos del tweet. */
function extraerMedia(legacy) {
  const lista = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];

  return lista.map((m) => {
    const media = { tipo: m.type, url: m.media_url_https };

    if (m.type !== 'photo') {
      // X manda varias calidades. Nos quedamos con la de mayor bitrate.
      const variantes = (m.video_info?.variants ?? []).filter((v) => v.content_type === 'video/mp4');
      const mejor = variantes.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      if (mejor) media.videoUrl = mejor.url;
    }

    return media;
  });
}

/** El texto completo. Los tweets largos lo traen en note_tweet, no en legacy. */
function extraerTexto(nodo, legacy) {
  const textoLargo = nodo.note_tweet?.note_tweet_results?.result?.text;
  return textoLargo ?? legacy.full_text ?? legacy.text ?? '';
}

/**
 * @param {object} resultado El nodo tweet_results.result de X
 * @returns {{tweet: import('../../shared/types').Tweet, autor: import('../../shared/types').Usuario|null}|null}
 */
function normalizarTweet(resultado) {
  const nodo = desenvolverTweet(resultado);
  if (!nodo) return null;

  const legacy = nodo.legacy;
  if (!legacy) return null;

  const id = nodo.rest_id ?? legacy.id_str;
  if (!id) return null;

  const autor = normalizarUsuario(nodo.core?.user_results?.result);

  const tweet = {
    id: String(id),
    autorId: autor ? autor.id : null,
    texto: extraerTexto(nodo, legacy),
    // legacy.created_at viene como "Wed Oct 10 20:19:24 +0000 2018"
    creadoEn: Date.parse(legacy.created_at) || Date.now(),
    respuestaA: legacy.in_reply_to_status_id_str ?? null,
    citaDe: legacy.quoted_status_id_str ?? null,
    metricas: {
      likes: legacy.favorite_count ?? 0,
      retweets: legacy.retweet_count ?? 0,
      respuestas: legacy.reply_count ?? 0,
      citas: legacy.quote_count ?? 0,
      vistas: Number(nodo.views?.count ?? 0),
    },
    media: extraerMedia(legacy),
  };

  return { tweet, autor };
}

module.exports = { normalizarTweet, desenvolverTweet };
