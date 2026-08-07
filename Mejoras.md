# Mejoras

Estado: ✅ hecho · ⏳ pendiente de tu sesión

1. ✅ Acceder a las listas del usuario y crear la columna con un click.
   - En "+ Columna" → tipo "Lista" aparece "Tus listas": un botón por lista; al
     pulsarlo se crea la columna al instante. El candado 🔒 marca las privadas.
   - Botón "Actualizar": abre tus listas en segundo plano y las vuelve a capturar.
   - No dependemos de adivinar el endpoint: detectamos las listas por su contenido
     en cualquier respuesta (igual que los tweets), así sobrevive a cambios de X.
   - Verificado: parser (10 casos), base de datos (guardar/orden/upsert), interfaz
     (selector + creación con un click). Falta confirmar la CAPTURA en vivo cuando
     tengas sesión activa (ahora mismo no hay auth_token en la partición).

2. Que en el WebView que se crea de la página principal, podamos tener opciones hechas a la medida, como por ejemplo:

2.1. ✅ Extraer el tweet, o abrir el tweet de la columna en el webview interno.
   - Botón ↗ en cada tweet: lo abre en la columna en vivo **principal** (así lees
     respuestas y comentas en X de verdad). La principal se fija con el pin 📌.
   - "Extraer" = botón `{ }`: exporta el JSON crudo original de X a un archivo.

2.2. ✅ Guardar tweets localmente.
   - Botón estrella (☆/★) en cada tweet. Los guardados aparecen en una columna
     nueva de tipo "Guardados (local)". No toca tu cuenta de X (es local).

2.3. ✅ Buscar desde el webview y agregar esa búsqueda como columna, con orden.
   - Al buscar dentro de una webview, aparece el botón ＋🔍 para añadir esa
     búsqueda como columna.
   - Las columnas de búsqueda ahora guardan el orden (Más recientes / Destacados /
     Personas / Multimedia). Antes estaba fijado a "recientes" en el código.

2.4. ✅ Mods configurables para la X original.
   - En Opciones → Mods de X se activan por separado la interfaz limpia, ocultar
     promociones de Premium, mostrar posts nuevos automáticamente y el orden del
     inicio (algoritmo de X o "Siguiendo" con los recientes primero).
   - Se aplican al instante en columnas en vivo y en la ventana original de X.
   - Los cosechadores quedan fuera para no alterar su navegación ni sus peticiones.

---

## Pendiente

- Confirmar en vivo la captura de listas (necesita sesión activa que persista).
  Al iniciar sesión con "Abrir X.com" (usuario y contraseña), la app captura tus
  listas al arrancar; si el selector sale vacío, pulsa "Actualizar".
