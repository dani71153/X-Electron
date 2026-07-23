# X-Electron

Cliente de escritorio para X.com construido con Electron, que carga la web real de X
pero le añade encima una capa propia de datos y una capa propia de interfaz.

Este documento es la referencia estable del proyecto. Cuando haya dudas de alcance o
de arquitectura, se vuelve aquí.

---

## 1. Objetivos

### Objetivo principal
Ver **varios flujos de X al mismo tiempo** (listas, grupos, búsquedas, perfiles,
notificaciones) en una interfaz multi-columna, sin depender de la interfaz oficial
de una sola columna.

### Objetivos concretos
1. Cargar X.com dentro de Electron y mantener la sesión iniciada del usuario.
2. Interceptar la información que X ya envía al navegador y guardarla localmente.
3. Renderizar esa información con nuestra propia UI (columnas, filtros, orden).
4. Permitir modificar la apariencia de X (CSS inyectado) para lo que sigamos usando
   de la interfaz original.
5. Funcionar offline en modo lectura sobre lo ya descargado.

### No-objetivos (por ahora)
- No es un bot: no publica, no da follow, no automatiza acciones masivas.
- No usa la API de pago de X.
- No sustituye por completo la web de X. Acciones como escribir un tweet o iniciar
  sesión se delegan a la vista original.

### Restricciones aceptadas
- El DOM y la API interna de X cambian sin aviso. La capa de datos debe estar
  aislada para que un cambio de X rompa un solo archivo, no toda la app.
- La automatización de X está limitada por sus Términos de Servicio. El proyecto se
  mantiene en lectura y presentación de datos que el usuario ya recibe en su sesión.

---

## 2. Cómo obtenemos los datos

Esta es la decisión más importante del proyecto. Hay dos caminos:

| | Leer el DOM (scraping) | Interceptar la API interna (GraphQL) |
|---|---|---|
| Estabilidad | Baja: cambia con cada rediseño | Media: el esquema JSON cambia menos |
| Datos disponibles | Solo lo que está pintado | Todo el objeto del tweet |
| Complejidad | Media | Media-alta |

**Decisión: interceptar la API interna.** Cuando X carga una lista o un timeline,
su propio JavaScript pide los datos a `https://x.com/i/api/graphql/...` y recibe
JSON. Nos colocamos en medio de esa petición, copiamos el JSON, lo normalizamos y
lo guardamos. X sigue funcionando igual; nosotros nos quedamos con una copia.

El scraping del DOM queda como plan B para datos puntuales que no aparezcan en el JSON.

### Consecuencia en la arquitectura
Cada flujo (columna) necesita que alguien "visite" esa URL de X para que la petición
ocurra. Por eso existen dos tipos de ventana de X:

- **Cosechadores (ocultos):** cargan una lista/búsqueda, hacen scroll automático
  suave, y solo sirven para provocar las peticiones de red. Se turnan: solo hay
  `MAX_COSECHADORES_ACTIVOS` abiertos a la vez.
- **Ventana visible (opcional):** la X original, para iniciar sesión y para lo que
  no reimplementamos.

Ambas comparten la partición `persist:x`, así que comparten la sesión.

Las columnas que ve el usuario **no son ventanas de X**, son HTML nuestro pintado con
los datos guardados. Esto es lo que hace viable tener 6 columnas sin que el equipo arda.

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                     │
│  - Ventana, menús, ciclo de vida                            │
│  - Intercepta respuestas de red (session.webRequest)         │
│  - Base de datos local (SQLite)                             │
│  - Expone todo por IPC                                      │
└───────────────┬──────────────────────┬──────────────────────┘
                │ IPC                  │ controla
                │                      │
┌───────────────▼──────────────┐  ┌────▼─────────────────────┐
│  RENDERER (nuestra UI)       │  │  WEBVIEWS X.com          │
│  - Layout multi-columna      │  │  - Cosechadores ocultos  │
│  - Pinta tweets desde SQLite │  │  - Vista original        │
│  - Filtros, búsqueda, temas  │  │  - preload.js inyectado  │
└──────────────────────────────┘  └──────────────────────────┘
```

### Las tres capas que pediste

**Capa de datos (`src/main/`)**
Captura, normaliza y persiste. No sabe nada de cómo se ve la app.

**Capa de UI/UX (`src/renderer/`)**
Lee de la base de datos vía IPC y decide cómo presentar. No sabe nada de X.

**Capa de inyección (`src/preload/`)**
El JavaScript y CSS personalizado que corre *dentro* de la página de X: oculta
elementos, aplica tema, hace scroll en los cosechadores.

Estas tres capas se comunican solo por IPC y por la base de datos. Nunca se llaman
directamente entre sí.

---

## 4. Estructura de carpetas

```
X-Electron/
├── PROYECTO.md                 ← este archivo
├── CLAUDE.md                   ← reglas de código
├── package.json
│
├── src/
│   ├── main/                   CAPA DE DATOS Y SISTEMA
│   │   ├── index.js            Punto de entrada de Electron
│   │   ├── window.js           Creación de la ventana principal
│   │   ├── ipc.js              Todos los canales IPC en un solo sitio
│   │   │
│   │   ├── capture/            Intercepción de red
│   │   │   ├── interceptor.js  Engancha session.webRequest
│   │   │   └── endpoints.js    Qué URLs de X nos interesan (CONFIG FRÁGIL)
│   │   │
│   │   ├── parse/              JSON de X → nuestros objetos
│   │   │   ├── tweet.js        Un tweet crudo → { id, autor, texto, ... }
│   │   │   ├── user.js
│   │   │   └── timeline.js     Recorre la estructura de "instructions/entries"
│   │   │
│   │   ├── db/                 Persistencia
│   │   │   ├── database.js     Abre SQLite, migraciones
│   │   │   ├── schema.sql
│   │   │   └── queries.js      Funciones: guardarTweet, tweetsDeColumna...
│   │   │
│   │   └── harvest/            Webviews cosechadores
│   │       └── harvester.js    Abre, hace scroll, cierra
│   │
│   ├── preload/                CAPA DE INYECCIÓN
│   │   ├── bridge.js           contextBridge: API segura para el renderer
│   │   ├── x-inject.js         JS que corre dentro de X.com
│   │   └── x-styles.css        CSS que corre dentro de X.com
│   │
│   ├── renderer/               CAPA DE UI/UX
│   │   ├── index.html
│   │   ├── main.js             Arranque de la UI
│   │   │
│   │   ├── layout/
│   │   │   ├── Board.js        El tablero: contiene N columnas
│   │   │   └── Column.js       Una columna: cabecera + lista + scroll
│   │   │
│   │   ├── components/
│   │   │   ├── Tweet.js
│   │   │   ├── Media.js
│   │   │   └── ColumnHeader.js
│   │   │
│   │   ├── state/
│   │   │   └── store.js        Estado de la UI (columnas abiertas, filtros)
│   │   │
│   │   └── styles/
│   │       ├── base.css
│   │       └── themes/
│   │
│   └── shared/                 Compartido entre procesos
│       ├── channels.js         Nombres de los canales IPC (constantes)
│       └── types.js            Forma de nuestros objetos
│
├── config/
│   ├── default-columns.json    Columnas al abrir por primera vez
│   └── settings.js             Rutas, límites, intervalos
│
└── docs/
    ├── ADR/                    Decisiones de arquitectura con fecha
    └── x-api-notes.md          Lo que vamos aprendiendo del JSON de X
```

### Reglas de la estructura
- `src/main/` nunca importa nada de `src/renderer/` ni al revés.
- Todo lo que dependa de cómo X estructura sus datos vive en `capture/` y `parse/`.
  Cuando X cambie, tocamos ahí y nada más.
- `src/shared/` solo tiene constantes y definiciones. Cero lógica.

---

## 5. Modelo de datos

```sql
-- Un tweet, tal como lo necesitamos nosotros
tweets (
  id            TEXT PRIMARY KEY,   -- id de X
  author_id     TEXT,
  text          TEXT,
  created_at    INTEGER,
  reply_to_id   TEXT,
  quoted_id     TEXT,
  metrics_json  TEXT,               -- likes, RTs, vistas
  media_json    TEXT,
  raw_json      TEXT,               -- el original, por si acaso
  captured_at   INTEGER
)

users (id, handle, name, avatar_url, verified, updated_at)

-- Un flujo que el usuario ha configurado
columns (
  id, title, type, source, position, filters_json
)
-- type: 'list' | 'search' | 'user' | 'home' | 'notifications'
-- source: el id de lista, el término de búsqueda, el handle...

-- Qué tweet apareció en qué columna y en qué orden
column_tweets (column_id, tweet_id, seen_at, PRIMARY KEY (column_id, tweet_id))
```

Guardamos `raw_json` siempre. Es barato y nos permite volver a parsear datos viejos
cuando mejoremos el parser, sin tener que redescargar nada.

---

## 6. Fases de desarrollo

Cada fase termina con algo que funciona y se puede probar.

**Fase 0 — Esqueleto** ✅ hecho
Electron abre la ventana del tablero y una ventana de X.com. Sesión persistente
entre reinicios mediante la partición `persist:x`.

**Fase 1 — Ver lo que pasa** ✅ hecho
El interceptor imprime `[graphql] <NombreDeOperacion>` para cada llamada. Sirve para
descubrir endpoints nuevos y añadirlos a `capture/endpoints.js`.

**Fase 2 — Capturar y guardar** ✅ hecho
Parser de timeline → SQLite. Verificado con un JSON de prueba que cubre los casos
raros (tweets largos, retweets, tombstones, formato viejo y nuevo de usuario).

**Fase 3 — Una columna** ✅ hecho
El renderer pinta los tweets desde la base de datos.

**Fase 4 — Multi-columna** ✅ hecho
Tablero horizontal, añadir y quitar columnas, cosechadores por turnos.
Falta: reordenar arrastrando.

**Fase 5 — UI/UX de verdad** 🔶 en curso
Hecho: visor de estado por columna (cabecera con "actualizada hace X"), columnas en
vivo (webview que embebe x.com), guardar tweets localmente (estrella + columna
"Guardados"), exportar el JSON crudo de un tweet, abrir un tweet en la columna en
vivo principal (pin 📌), y añadir búsquedas desde la webview con orden configurable.
También hay atajos para crear y refrescar columnas, abrir opciones y ocultar la
barra de herramientas incluso con el foco dentro de una columna en vivo.
QoL añadido: paleta de comandos, navegación entre columnas, columnas contraíbles
y redimensionables, WebView ajustable al espacio libre del tablero, marcador de
lectura, filtros locales, densidad configurable,
deshacer al borrar, pausa real de cosecha, espacios de trabajo y copia/restauración
de la configuración en JSON.
Falta: listas del usuario con un click (pendiente de reconocer el endpoint), temas,
scroll infinito hacia atrás en el histórico.

**Fase 6 — Interacción** ⬜ pendiente de decisión
Dar like o responder desde nuestra columna, delegando la acción a la ventana de X.
Esta fase cruza de "leer datos que ya recibes" a "automatizar acciones", que es
territorio de los Términos de Servicio de X. Se decide antes de empezarla.

---

## 7. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Framework UI | Ninguno (JS + DOM) al principio | Menos capas mientras exploramos |
| Persistencia | SQLite vía `node:sqlite` | Sin dependencias ni compilación nativa |
| Embebido de X | `BrowserWindow` con partición compartida | Más simple que `<webview>` |
| Captura de datos | Protocolo de depuración (CDP) | `webRequest` no expone el cuerpo |
| Aislamiento | `contextIsolation: true`, sandbox en X | Obligatorio, sin excepciones |
| Node en renderer | Desactivado | Todo pasa por IPC |
| Empaquetado | `electron-builder` | Se decide en Fase 5 |

### Dos modos de columna: datos y en vivo
Una columna puede ser de dos tipos (campo `live` en la tabla `columns`):

- **De datos** (por defecto): un cosechador oculto la alimenta y el renderer pinta
  los tweets desde SQLite. Tiene visor de estado ("actualizada hace X").
- **En vivo**: una `<webview>` embebe x.com en directo (perfil, lista, búsqueda,
  grupo). No se cosecha: la webview ya es la vista. Comparte la sesión (`persist:x`)
  y hereda el bloqueo de passkey vía el preload `x-inject.js`.

El modo en vivo es para vigilar varias fuentes a la vez sin esperar al ciclo de
cosecha. Cuesta más RAM (cada webview es un X completo), por eso no es el modo por
defecto.

### Por qué `node:sqlite` y no `better-sqlite3`
`better-sqlite3` es una extensión nativa: hay que compilarla con Visual Studio y
recompilarla contra el ABI de cada versión de Electron. En esta máquina no hay
toolchain de C++ y la compilación falla. El Node que trae Electron 43 incluye
`node:sqlite`, que da la misma API síncrona sin compilar nada. Si algún día
necesitamos algo que `node:sqlite` no tenga, la única capa que cambia es
`src/main/db/`.

### Por qué el depurador y no `session.webRequest`
`webRequest` deja ver las cabeceras de una respuesta pero **no su cuerpo**, y el
cuerpo es justo lo que queremos. El protocolo de depuración de Chrome sí lo expone
(`Network.getResponseBody`). No modificamos la petición: X funciona igual, nosotros
copiamos lo que ya viajaba.

---

## 7.5. Política de peticiones (para no que X no nos bloquee)

La app genera tráfico real contra la cuenta del usuario. Si ese tráfico parece un
robot, X puede limitar (`429`) o bloquear la cuenta. Reglas, todas en
`src/main/harvest/`:

- **Ritmo humano.** Cada columna se cosecha cada ~5 min (`CICLO_MS`), con 4 scrolls
  por ciclo. Un usuario que deja X abierto se parece a esto; recargar cada pocos
  segundos, no.
- **Reutilizar ventanas.** Recargar una página de X dispara una ráfaga de ~9
  llamadas GraphQL, no una. Por eso las ventanas se reutilizan y solo se recargan
  cada 20 min (`RECARGA_MS`).
- **Una a la vez.** La cosecha es un bucle `while` secuencial con `await`, no un
  `setInterval`. Nunca hay dos ciclos solapados. (La versión anterior usaba
  `setInterval` sobre una función async y filtraba ventanas que cosechaban para
  siempre.)
- **Jitter.** Toda espera lleva ±40% de variación (`JITTER`). Los intervalos
  exactos delatan a un robot.
- **No paginar en balde.** Antes de bajar se comprueba si la página ya está en el
  fondo; si lo está, no se pide más. Al terminar el ciclo se vuelve arriba.
- **Backoff.** Ante un `429`/`403` (o el error 88 de X dentro de un `200`), se para
  todo y se espera, doblando el tiempo hasta 30 min. Ver `interceptor.js` y
  `frenar()` en `harvester.js`.
- **Sesión inválida.** Si X redirige al login, se para y se avisa en la interfaz,
  en vez de recargar la pantalla de login en bucle.

---

## 8. Riesgos

- **X cambia su API interna.** Mitigación: todo el conocimiento de X está en dos
  carpetas; `raw_json` nos deja re-parsear sin perder datos.
- **Los cosechadores consumen mucha RAM.** Mitigación: las ventanas se reutilizan y
  hay un tope de cuántas viven a la vez (`MAX_VENTANAS_VIVAS`).
- **Windows Hello saltaba solo.** La pantalla de login de X llama a
  `navigator.credentials.get()` con mediación condicional nada más cargar, y Chrome
  responde abriendo Windows Hello. Como los cosechadores son ventanas ocultas, el
  diálogo aparecía sin origen visible y se repetía en cada rotación de turno.
  Mitigación doble:
  1. No se cosecha nada sin sesión iniciada (`src/main/session.js`). Sin sesión no
     hay timelines que capturar, solo pantallas de login.
  2. WebAuthn está desactivado en todas las páginas de X (`src/preload/x-inject.js`).

  **Consecuencia aceptada:** no se puede iniciar sesión en X con passkey desde esta
  app; hay que usar contraseña. Tampoco funciona "Iniciar sesión con Google", que
  usa la misma API.

- **Términos de Servicio.** El proyecto lee datos que la sesión del usuario ya
  recibe y no automatiza acciones. La Fase 6 cambia eso y se evalúa aparte.
- **Que X bloquee la cuenta por tráfico anómalo.** Es el riesgo más serio de la app,
  porque el tráfico sale de la cuenta real del usuario. Toda la mitigación está en la
  sección 7.5 (ritmo humano, jitter, reutilizar ventanas, backoff ante `429`).
- **Cosechar Notificaciones marca las notificaciones como leídas.** Cada vez que se
  visita `x.com/notifications`, X las marca leídas. Por eso ese tipo de columna ya no
  viene por defecto y la interfaz avisa al añadirla.

---

## 9. Cómo ejecutarlo

```bash
npm install
npm run dev     # con DevTools abiertas y logs de endpoints
npm run dev:memory # muestra RAM/CPU por proceso cada 15 segundos
npm start       # normal
```

El modo `dev:memory` permite distinguir la ventana principal de los renderers
ocultos y comprobar cuanta memoria privada libera cada limite de cosechadores.

**La primera vez hay que iniciar sesión:** pulsa *Abrir X.com*, entra con tu cuenta
y cierra esa ventana. La sesión queda guardada en la partición `persist:x`, así que
los cosechadores ya la tendrán y no hay que repetirlo en cada arranque.

Sin sesión iniciada, X redirige a la página de bienvenida y no hace ninguna llamada
a su API de timelines: las columnas se quedan vacías. Es el comportamiento esperado,
no un fallo.

La base de datos se crea en `%APPDATA%/x-electron/x-electron.db`. Se puede borrar
para empezar de cero.

---

## 10. Glosario

- **Cosechador (harvester):** webview oculto cuya única función es que X pida datos.
- **Columna:** un flujo configurado por el usuario, pintado con nuestra UI.
- **Tablero (board):** el conjunto de columnas visibles.
- **Interceptor:** el código en main que copia las respuestas JSON de X.
