# Notas sobre la API interna de X

Este archivo se va rellenando a mano según observamos el tráfico real.
Es la memoria del proyecto sobre algo que X puede cambiar sin avisar.

## Forma de las URLs

```
https://x.com/i/api/graphql/<hash>/<NombreDeOperacion>?variables=...&features=...
```

El `<hash>` cambia con cada despliegue de X. **No lo uses nunca como identificador.**
El `<NombreDeOperacion>` es mucho más estable: es lo que usamos en
`src/main/capture/endpoints.js`.

## Operaciones que nos interesan

| Operación | Cuándo aparece |
|---|---|
| `HomeTimeline` | Pestaña "Para ti" |
| `HomeLatestTimeline` | Pestaña "Siguiendo" |
| `ListLatestTweetsTimeline` | Al abrir una lista |
| `SearchTimeline` | Búsqueda (`f=live` para recientes) |
| `UserTweets` | Perfil de un usuario |
| `TweetDetail` | Al abrir un hilo |
| `NotificationsTimeline` | Notificaciones |

Para confirmar los nombres reales: arranca con `npm run dev` y mira la consola.
El interceptor imprime `[graphql] <NombreDeOperacion>` para cada llamada.
Añade a `OPERACIONES_DE_TIMELINE` las que veas y falten.

## Dónde están los tweets dentro del JSON

La ruta cambia según el endpoint. Ejemplo de un timeline de lista:

```
data
└── list
    └── tweets_timeline
        └── timeline
            └── instructions[]           <- type: "TimelineAddEntries"
                └── entries[]
                    └── content
                        └── itemContent
                            └── tweet_results
                                └── result   <- EL TWEET
```

Por eso **no seguimos la ruta**. `src/main/parse/timeline.js` recorre todo el JSON
buscando cualquier nodo con estas claves:

- `tweet_results.result` — el tweet de una entrada
- `retweeted_status_result.result` — el original de un retweet
- `quoted_status_result.result` — el tweet citado

Así sobrevivimos a los rediseños de X sin tocar el parser.

## Listas del usuario

La página `x.com/i/lists` sirve las listas con la operación
`ListsManagementPageTimeline` (owned + subscribed). **No la fijamos** como única:
`capture/endpoints.js` acepta cualquier operación cuyo nombre contenga `List`, y
`parse/list.js` además detecta las listas por su contenido (`__typename: "List"`,
o por forma: `id_str` + `name` + `member_count`). Así sobrevive a renombrados.

La captura la dispara `harvest/listas.js`: abre `x.com/i/lists` en una ventana
oculta una sola vez (al arrancar sin listas guardadas, o al pulsar "Actualizar").
Ojo: el objeto lista anida a su usuario dueño; el parser no lo confunde con una
lista porque exige los campos de lista.

## Trampas conocidas

- **`__typename: "TweetWithVisibilityResults"`**: el tweet real está en `.tweet`,
  un nivel más abajo. Lo desenvuelve `desenvolverTweet()`.
- **`__typename: "TweetTombstone"`**: tweet borrado o no visible. Se ignora.
- **Tweets largos**: el texto completo NO está en `legacy.full_text`, sino en
  `note_tweet.note_tweet_results.result.text`. `legacy.full_text` viene cortado.
- **Migración `legacy` → `core`**: X está moviendo `screen_name` y `name` del
  usuario de `legacy` a `core`. `parse/user.js` lee de los dos.
- **El avatar** puede estar en `avatar.image_url` (nuevo) o en
  `legacy.profile_image_url_https` (viejo).
- **`views.count`** llega como *string*, no como número. Hay que convertirlo.

## Passkeys y Windows Hello

La pantalla de login de X llama a `navigator.credentials.get()` con
`mediation: 'conditional'` nada más cargar. Chrome responde abriendo Windows Hello.

Medido en Electron 43, en una página cualquiera sin bloqueo:

| | Por defecto | Con nuestro bloqueo |
|---|---|---|
| `isConditionalMediationAvailable()` | `true` | `false` |
| `isUserVerifyingPlatformAuthenticatorAvailable()` | `false` | `false` |

Es `isConditionalMediationAvailable` el que abre la puerta. Poniéndolo en `false`,
X ni siquiera intenta pedir la passkey.

### Cómo se bloquea (y cómo NO)

Se hace en `src/preload/x-inject.js` con `contextBridge.executeInMainWorld()`.

- **No sirve** asignar `navigator.credentials.get` directamente en el preload: con
  `contextIsolation` estarías cambiando tu copia del mundo aislado, no la que ve X.
- **No sirve** el depurador con `Page.addScriptToEvaluateOnNewDocument`: en Electron
  los comandos CDP **no resuelven hasta que la ventana ha cargado algo**. `Page.enable`
  se queda colgado para siempre si la llamas antes del primer `loadURL`. Para cuando
  responde, X ya ha ejecutado su script.
- **No sirve** el interruptor `--disable-features=WebAuthenticationUseNativeWinApi`.
  Medido: no cambia ninguno de los dos valores de la tabla.

## Cuerpo de las respuestas

`session.webRequest` de Electron **no** expone el cuerpo de las respuestas, solo
las cabeceras. Por eso usamos el protocolo de depuración de Chrome (CDP):
`Network.enable` + `Network.getResponseBody`. Ver `src/main/capture/interceptor.js`.

Chrome descarta el cuerpo pasado un rato, así que hay que pedirlo en cuanto llega
`Network.loadingFinished`. Si llegamos tarde, se pierde esa tanda y ya está: el
siguiente scroll la vuelve a pedir.
