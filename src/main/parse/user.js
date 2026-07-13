// Convierte el objeto de usuario que manda X en nuestro objeto Usuario.
//
// X esta migrando los campos de `legacy` a `core`. Leemos de los dos,
// primero el nuevo y si no existe el viejo.

/**
 * @param {object} resultado El nodo user_results.result de X
 * @returns {import('../../shared/types').Usuario|null}
 */
function normalizarUsuario(resultado) {
  if (!resultado) return null;

  const legacy = resultado.legacy ?? {};
  const core = resultado.core ?? {};

  const id = resultado.rest_id ?? legacy.id_str;
  const handle = core.screen_name ?? legacy.screen_name;

  if (!id || !handle) return null;

  return {
    id: String(id),
    handle: String(handle),
    nombre: core.name ?? legacy.name ?? handle,
    avatarUrl: resultado.avatar?.image_url ?? legacy.profile_image_url_https ?? '',
    verificado: Boolean(resultado.is_blue_verified ?? legacy.verified ?? false),
  };
}

module.exports = { normalizarUsuario };
