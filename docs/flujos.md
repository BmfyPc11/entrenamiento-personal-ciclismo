# Flujos principales

Diagramas de los recorridos de datos más importantes del panel. Se renderizan
solos en GitHub y en VS Code. Si cambias un flujo, actualiza aquí el diagrama
correspondiente.

Índice:

1. [Arquitectura general](#1-arquitectura-general)
2. [Autenticación con Strava (OAuth)](#2-autenticación-con-strava-oauth)
3. [Sincronización (`POST /api/sync`)](#3-sincronización-post-apisync)
4. [Carga del Dashboard y streams en segundo plano](#4-carga-del-dashboard-y-streams-en-segundo-plano)
5. [Comparación de Amigos](#5-comparación-de-amigos)
6. [Analizador de GPX](#6-analizador-de-gpx)

---

## 1. Arquitectura general

Next.js 14 (App Router) hace de todo: sirve la UI y expone las rutas de API que
hablan con Strava y con Postgres. El navegador nunca llama a Strava directamente
—siempre pasa por el servidor, que es quien tiene el token.

```mermaid
flowchart LR
    subgraph navegador["Navegador"]
        UI["Dashboard.jsx + componentes"]
        LS["localStorage<br/>cfg · streams cacheados<br/>segmentos manuales"]
        UI <--> LS
    end

    subgraph servidor["Next.js 14 (Vercel)"]
        PAGE["app/page.js<br/>SSR: lee sesión"]
        API["app/api/*<br/>route handlers"]
        LIBS["lib/strava.js · lib/repo.js<br/>lib/metrics.js · lib/gpx.js<br/>lib/amigos.js"]
        API --> LIBS
        PAGE --> LIBS
    end

    DB[("Postgres<br/>salidas · streams · splits<br/>puertos_hechos · atletas<br/>segmentos_manuales")]
    STRAVA["Strava API v3<br/>oauth/token · /athlete/activities<br/>/activities/:id/streams<br/>/athlete/routes · export_gpx"]

    UI -->|fetch| API
    UI -->|navegación / F5| PAGE
    LIBS -->|pg| DB
    LIBS -->|HTTPS + Bearer token| STRAVA
```

**Claves**

- La identidad del ciclista y los tokens viven en una **cookie httpOnly**
  (`sesion_strava`, base64), no en la base de datos. La tabla `atletas` solo
  guarda id + nombre, y se rellena en el login y en cada sync para que la
  pestaña Amigos pueda listar a todo el mundo.
- Los cálculos pesados (`lib/metrics.js`, `lib/gpx.js`, `lib/amigos.js`) son
  funciones puras sin red ni navegador, para poder probarlos con `node --test`.

---

## 2. Autenticación con Strava (OAuth)

Sin cookie de sesión válida, `app/page.js` pinta `Login`. El resto es el
_authorization code flow_ estándar de Strava.

```mermaid
sequenceDiagram
    autonumber
    participant U as Navegador
    participant P as page.js
    participant A as /api/auth/strava
    participant S as Strava OAuth
    participant CB as /api/auth/callback
    participant DB as Postgres

    U->>P: GET /
    P->>P: leerSesion() devuelve null
    P-->>U: Login
    U->>A: click "Conectar con Strava"
    A->>A: comprueba STRAVA_CLIENT_ID / SECRET
    A-->>U: 302 a oauth/authorize<br/>scope: read_all, activity:read_all, profile:read_all
    U->>S: autoriza la app
    S-->>U: 302 a /api/auth/callback?code=...&scope=...
    U->>CB: GET /api/auth/callback
    alt falta code, o falta scope activity:read
        CB-->>U: 302 a /?error=...
    else code y scope válidos
        CB->>S: canjearCodigo(code) — POST oauth/token
        S-->>CB: access_token, refresh_token, expires_at, athlete
        CB-->>U: guardarSesion(): Set-Cookie sesion_strava (httpOnly, 180d)
        CB->>DB: registrarAtleta(atleta) — si falla, se ignora
        CB-->>U: 302 a /
    end
    U->>P: GET / (ya con cookie)
    P-->>U: Dashboard
```

**Refresco de token** — no hay ruta dedicada. Cualquier llamada a Strava pasa
por `tokenValido()` en `lib/strava.js`: si al `access_token` le quedan menos de
120 s, lo refresca contra `oauth/token` y reescribe la cookie antes de seguir.

**Logout** — `POST /api/auth/logout` solo borra la cookie.

---

## 3. Sincronización (`POST /api/sync`)

Se dispara a mano desde el botón "Actualizar" o desde el banner de "salidas sin
sincronizar". Es la operación cara: la única que descarga datos nuevos de
Strava, y va vigilando el límite de la API para no provocar un 429.

```mermaid
flowchart TD
    START["POST /api/sync"] --> SES{"leerSesion()?"}
    SES -->|no| E401["401 sin_sesion"]
    SES -->|sí| REG["registrarAtleta() (best-effort)"]

    REG --> CONO["obtenerPersonasConocidas(athleteId)<br/>mapa id → athlete_count cacheado"]
    CONO --> TRAER["traerActividades(5 páginas, conocidas)<br/>GET /athlete/activities paginado"]
    TRAER --> GUARDAR["guardarSalidas(salidas, athleteId)"]

    GUARDAR --> CAT["listarSegmentosManuales()<br/>fingerprintCatalogo()"]
    CAT --> PEND["pendientes = salidas sin streams<br/>más recientes primero"]

    PEND --> LOOP{"quedan pendientes<br/>y lejos del límite?"}
    LOOP -->|sí| STREAM["traerStreams(id)<br/>GET /activities/:id/streams"]
    STREAM --> SAVE["guardarStreams()<br/>guardarSplits(calcularSplits())<br/>guardarPuertosHechos(medirSegmentosManualesEnSalida())"]
    SAVE --> LOOP
    LOOP -->|no| BACK["Backfill local, sin llamar a Strava:<br/>salidas con streams pero sin splits,<br/>o con puertos_hechos de una versión<br/>vieja del catálogo"]

    BACK --> RESP["200 { ok, sincronizadas,<br/>detalleNuevo, aviso }"]

    STREAM -.->|"x-ratelimit-usage &gt; 90%"| CUT["corta la tanda:<br/>lo que quede sin detalle<br/>espera al próximo sync"]
    CUT --> BACK
```

**Por qué en este orden**

- Los streams solo se piden de lo que aún no los tiene: son inmutables una vez
  terminada la salida, releerlos era el gasto que agotó la cuota de la API.
- Se procesan de la más reciente a la más antigua: si Strava corta a mitad, lo
  que se queda sin sincronizar es lo viejo, no lo que el usuario acaba de subir.
- El backfill recalcula `splits` y `puertos_hechos` que quedaron obsoletos
  (cálculo nuevo, o segmento manual creado/editado). Es todo Postgres, no
  compite por el límite de Strava.

**Comprobación ligera** — `GET /api/sync/check` es otra cosa: una sola petición
a Strava con los ids de las ~11 últimas actividades, para decidir si enseñar el
banner. No sincroniza nada.

---

## 4. Carga del Dashboard y streams en segundo plano

Al montar, el Dashboard lee de **Postgres** (rápido, sin tocar Strava) y luego
va rellenando en segundo plano el detalle de cada salida, con caché en
`localStorage` para que un F5 no vuelva a pedirlo todo.

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard.jsx
    participant AC as /api/activities
    participant SP as /api/splits
    participant CH as /api/sync/check
    participant ST as /api/streams
    participant DB as Postgres

    Note over D: montaje
    D->>D: leerCacheStreams() desde localStorage
    par carga inicial desde BD
        D->>AC: GET /api/activities
        AC->>DB: listarSalidas(athleteId)
        AC-->>D: salidas, atleta
    and
        D->>SP: GET /api/splits
        SP->>DB: obtenerSplits(athleteId)
        SP-->>D: splits
    and
        D->>CH: GET /api/sync/check
        CH-->>D: cantidad, saturado
        Note right of D: si hay salidas nuevas, se enseña el banner "sin sincronizar"
    end

    Note over D: bucle de fondo, una salida cada 400 ms aprox.
    loop cada salida sin stream en caché
        D->>D: si cercaDelLimite(limiteRef), corta el bucle
        D->>ST: GET /api/streams?id=...
        ST->>DB: obtenerStreams(id)
        ST-->>D: streams (404 si no está sincronizada)
        D->>D: normalizarAltitud() y setCache()<br/>persiste en localStorage (recorte a 40 salidas)
    end
```

**Notas**

- El bucle de fondo llama a `/api/streams`, que **solo lee Postgres**: si una
  salida no está sincronizada devuelve 404 y esa salida se queda sin perfil
  hasta el próximo `/api/sync`.
- El `limite` de Strava que se usa para frenar aquí viaja en el cuerpo de las
  respuestas de `/api/streams` incluso cuando son error.
- Abrir una salida a mano en Actividades la pide al instante; el bucle mira la
  caché antes de cada petición para no pedirla dos veces.

---

## 5. Comparación de Amigos

`GET /api/amigos/comparar` compara a quien mira contra todos los ciclistas que
han conectado su Strava en el mismo panel. Todo se agrega en el servidor: nunca
se devuelven streams de nadie.

```mermaid
flowchart TD
    REQ["GET /api/amigos/comparar"] --> SES{"sesión con atleta?"}
    SES -->|no| ERR["401 / 400"]
    SES -->|sí| LIST["listarAtletas(yo.id)<br/>lista: yo + los demás"]

    LIST --> SEG["listarSegmentosManuales()<br/>puertos marcados a mano"]
    SEG --> FOR["para cada atleta (N = 2-3)"]

    FOR --> S1["listarSalidas(id)"]
    FOR --> S2["obtenerSplits(id)"]
    FOR --> S3["obtenerResumenPuertos(id)<br/>precalculado en puertos_hechos"]

    S1 --> AGG["lib/amigos.js"]
    S2 --> AGG
    AGG --> MS["mejoresSplits(salidas, splits)<br/>solo salidas llanas, ref. de terreno propia"]
    AGG --> VOL["volumen(salidas, ahora)<br/>30 días / 12 meses / histórico"]

    MS --> OUT["JSON { atletas, segmentos, comparacion }"]
    VOL --> OUT
    S3 --> OUT
    OUT --> TAB["Amigos.jsx: 3 tablas<br/>Volumen · Puertos · Splits<br/>resalta al mejor de cada fila"]
```

**Notas**

- Son N+1 consultas (una tanda por persona), pero N es el número de gente que ha
  conectado: 2-3. No se pagina.
- Los tiempos de puerto salen ya calculados de `puertos_hechos` (la llena
  `/api/sync`), no se recalculan sobre streams aquí.
- Con menos de 2 atletas la pestaña solo muestra el aviso de "cuando otro
  ciclista conecte su Strava…".

---

## 6. Analizador de GPX

Dos formas de meter una ruta, un solo analizador. El análisis (`analizarRuta`,
`lib/gpx.js`) corre **entero en el navegador**.

```mermaid
flowchart TD
    FILE["Subir archivo .gpx<br/>FileReader, no se sube a ningún sitio"]
    SAVED["Elegir una ruta guardada en Strava"]

    SAVED --> RUTAS["GET /api/rutas<br/>traerRutas() → GET /athlete/routes"]
    RUTAS -->|401 / 403| PERM["sin_permiso_rutas<br/>cuenta conectada sin scope read_all"]
    RUTAS --> PICK["lista de rutas en Rutas.jsx"]
    PICK --> GPXAPI["GET /api/rutas/gpx?id=...<br/>traerGpxRuta() → GET /routes/:id/export_gpx"]

    FILE --> PARSE["parseGPX(texto)<br/>acepta &lt;trkpt&gt; y &lt;rtept&gt;"]
    GPXAPI --> PARSE

    PARSE --> REFS["referenciasCiclista(salidas, cache, excluidas)<br/>tu nivel actual, desde lo ya hecho"]
    REFS --> ANALIZAR["analizarRuta(datos, ref, cfg)<br/>puertos, dureza, ¿a tu alcance?"]
    ANALIZAR --> NOMBRAR["nombrarPuertosRuta()<br/>cruza con segmentos manuales por coordenadas"]
    NOMBRAR --> VISTA["AnalizadorGPX.jsx<br/>Perfil + PerfilPuerto + tabla de dureza"]
```

**Notas**

- El archivo subido se lee con `FileReader` en el cliente; no hay ruta de API
  para subirlo.
- La ruta de Strava sí pasa por el servidor (necesita el token), pero solo para
  traer el GPX: se reutiliza el mismo `parseGPX` que los archivos locales.
- Los nombres de las subidas salen del catálogo de segmentos marcados a mano; lo
  que no está marcado queda como "Subida N".
