# Nombres reales de las subidas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir `Subida N` por el nombre real de cada subida, tomándolo de los segmentos de Strava en las salidas rodadas y de los nodos de cima de OpenStreetMap en las rutas planificadas, con renombrado manual por encima de ambos.

**Architecture:** Toda la lógica de decisión vive en `lib/nombres.js` como funciones puras y sin dependencias, para poder probarla sin red ni navegador. Dos endpoints de Next.js hacen la parte sucia (hablar con Strava y con Overpass) porque ambos servicios exigen cabeceras que un navegador no puede fijar. Los componentes solo consumen y pintan.

**Tech Stack:** Next.js 14 (App Router), React 18, JavaScript sin TypeScript, `node --test` como runner (viene con Node, sin dependencias nuevas).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-07-nombres-de-subidas-design.md`.
- **Nunca cargar nombres en masa.** Los segmentos cuestan una petición por salida contra un límite de 100 cada 15 minutos.
- **Nada puede romper lo existente.** Si el nombrado falla, se muestra `Subida N` exactamente como hoy.
- Precedencia fija: `manual > strava > osm > "Subida N"`.
- Radio para considerar dos cimas la misma subida: **250 m** (el mismo que ya usa `agruparAscensiones`).
- Tolerancia de altitud para aceptar un nodo de OSM: **60 m**. Radio de reserva: **300 m**. Radio de consulta a Overpass: **1000 m**.
- Comentarios y textos de interfaz en español, siguiendo el tono del resto del proyecto: explicar el porqué, no narrar el qué.
- No se toma de los segmentos ningún dato numérico. Solo el nombre.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/nombres.js` | **Crear.** Lógica pura: emparejar segmento, elegir cima, caché por proximidad. Sin red, sin React, sin `next/headers`. |
| `tests/nombres.test.mjs` | **Crear.** Pruebas de `lib/nombres.js`. |
| `lib/strava.js` | **Modificar.** Añadir `traerSegmentos(id)`. |
| `app/api/nombres/segmentos/route.js` | **Crear.** Proxy a Strava. |
| `app/api/nombres/cima/route.js` | **Crear.** Proxy a Overpass. |
| `components/Entrenamientos.jsx` | **Modificar.** Nombres de la salida abierta. |
| `components/Ascensiones.jsx` | **Modificar.** Botón de búsqueda, sustituir Nominatim, renombrado manual. |
| `components/Rutas.jsx` | **Modificar.** Nombres vía Overpass. |
| `components/AnalizadorGPX.jsx` | **Modificar.** Igual que Rutas. |
| `package.json` | **Modificar.** Script `test`. |

`lib/nombres.js` no debe importar nada de `next/*` ni de `react`. Es la condición que permite probarlo con `node --test`.

---

### Task 1: Emparejar una subida con su segmento de Strava

`detectarPuertos` devuelve `inicio` y `fin`, índices dentro de los streams. Los `segment_efforts` de Strava traen `start_index`/`end_index` sobre esos mismos streams. Emparejar es comparar solapamiento de índices.

**Files:**
- Create: `lib/nombres.js`
- Create: `tests/nombres.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nada.
- Produces: `emparejarSegmento(puerto, efforts) -> string | null`, donde `puerto` es `{inicio: number, fin: number}` y `efforts` es `[{nombre: string, inicio: number, fin: number, categoria: number}]`.

- [ ] **Step 1: Añadir el script de pruebas**

En `package.json`, dentro de `"scripts"`, añadir:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `tests/nombres.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emparejarSegmento } from '../lib/nombres.js';

const ef = (nombre, inicio, fin, categoria = 0) => ({ nombre, inicio, fin, categoria });

test('sin efforts no hay nombre', () => {
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, []), null);
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, null), null);
});

test('solapamiento total devuelve el nombre', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Montjuïc', 100, 200)]);
  assert.equal(r, 'Montjuïc');
});

test('solapamiento parcial suficiente devuelve el nombre', () => {
  // subida 100-200, segmento 150-260: solapan 50 sobre un minimo de 100 -> 50 %
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Rat Penat', 150, 260)]);
  assert.equal(r, 'Rat Penat');
});

test('solapamiento insuficiente se descarta', () => {
  // solapan 20 sobre un minimo de 100 -> 20 %
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Otro', 180, 400)]);
  assert.equal(r, null);
});

test('sin solapamiento se descarta', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Lejos', 300, 400)]);
  assert.equal(r, null);
});

test('gana el catalogado como puerto aunque solape menos', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Rampa suelta', 100, 200, 0),
    ef('Sant Pere Màrtir', 120, 200, 3),
  ]);
  assert.equal(r, 'Sant Pere Màrtir');
});

test('a igual categoria gana el de mayor solapamiento', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Corto', 170, 200, 0),
    ef('Largo', 105, 200, 0),
  ]);
  assert.equal(r, 'Largo');
});

test('un effort sin nombre no cuenta', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('', 100, 200)]);
  assert.equal(r, null);
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/nombres.js'`

- [ ] **Step 4: Implementar**

Crear `lib/nombres.js`:

```js
/* ============================================================
   Nombres reales de las subidas.

   Este modulo no habla con la red ni con el navegador a proposito:
   solo decide. Asi se puede probar entero con node --test, sin
   levantar Next ni depender de que Strava u Overpass respondan.
   ============================================================ */

/* Un segmento tiene que cubrir al menos esta fraccion del tramo mas
   corto para dar por hecho que habla de la misma subida. Por debajo
   suele ser un segmento vecino que solo roza el final. */
const MIN_SOLAPE = 0.5;

/*
  Empareja una subida detectada con el segmento de Strava que la nombra.

  Se compara por indices y no por geometria porque detectarPuertos y los
  segment_efforts de Strava se refieren a los mismos streams: inicio y
  fin son posiciones dentro del mismo array.
*/
export function emparejarSegmento(puerto, efforts) {
  if (!puerto || !Array.isArray(efforts) || !efforts.length) return null;

  const largo = puerto.fin - puerto.inicio;
  if (!(largo > 0)) return null;

  const validos = [];
  for (const e of efforts) {
    if (!e || !e.nombre) continue;
    const largoE = e.fin - e.inicio;
    if (!(largoE > 0)) continue;

    const solape = Math.min(puerto.fin, e.fin) - Math.max(puerto.inicio, e.inicio);
    if (solape <= 0) continue;
    if (solape < MIN_SOLAPE * Math.min(largo, largoE)) continue;

    validos.push({ nombre: e.nombre, categoria: e.categoria || 0, solape });
  }

  if (!validos.length) return null;

  /*
    Gana el que Strava cataloga como puerto. Un segmento catalogado es
    una subida reconocida; uno sin catalogar puede ser cualquier tramo
    que alguien creo, y su nombre suele ser peor titulo.
  */
  validos.sort((a, b) =>
    (b.categoria > 0) - (a.categoria > 0) || b.solape - a.solape);

  return validos[0].nombre;
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `npm test`
Expected: PASS, 8 pruebas.

- [ ] **Step 6: Commit**

```bash
git add lib/nombres.js tests/nombres.test.mjs package.json
git commit -m "feat: emparejar subidas con segmentos de Strava por solapamiento de indices"
```

---

### Task 2: Elegir la cima correcta entre los nodos de OSM

Al medir contra cimas reales, el nodo más cercano no siempre es el correcto: cerca de Sant Pere Màrtir el pico más próximo estaba a 360 m y el nombre bueno a 709 m. La altitud de la cima, que se conoce por el GPX, desempata.

**Files:**
- Modify: `lib/nombres.js`
- Modify: `tests/nombres.test.mjs`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `elegirCima(candidatos, altCima) -> {nombre, distancia, altitud} | null`, donde `candidatos` es `[{nombre: string, distancia: number, altitud: number|null}]` con `distancia` en metros.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al final de `tests/nombres.test.mjs`:

```js
import { elegirCima } from '../lib/nombres.js';

const cand = (nombre, distancia, altitud) => ({ nombre, distancia, altitud });

test('sin candidatos no hay cima', () => {
  assert.equal(elegirCima([], 400), null);
  assert.equal(elegirCima(null, 400), null);
});

test('gana la altitud que cuadra aunque este mas lejos', () => {
  // el caso Sant Pere Martir: el pico cercano no cuadra en altura
  const r = elegirCima([
    cand('Turó del Temple', 360, 262),
    cand('Sant Pere Màrtir', 709, 389),
  ], 385);
  assert.equal(r.nombre, 'Sant Pere Màrtir');
});

test('entre dos que cuadran en altitud gana el mas cercano', () => {
  const r = elegirCima([
    cand('Lejos', 800, 400),
    cand('Cerca', 120, 395),
  ], 398);
  assert.equal(r.nombre, 'Cerca');
});

test('sin altitud que cuadre vale el mas cercano dentro de 300 m', () => {
  const r = elegirCima([cand('Vecino', 250, 120)], 400);
  assert.equal(r.nombre, 'Vecino');
});

test('sin altitud que cuadre y lejos de 300 m no hay nombre', () => {
  assert.equal(elegirCima([cand('Vecino', 450, 120)], 400), null);
});

test('los nodos sin nombre se descartan', () => {
  assert.equal(elegirCima([cand('', 50, 400)], 400), null);
  assert.equal(elegirCima([cand(null, 50, 400)], 400), null);
});

test('un nodo sin altitud solo vale por la regla de cercania', () => {
  assert.equal(elegirCima([cand('Sin ele', 200, null)], 400).nombre, 'Sin ele');
  assert.equal(elegirCima([cand('Sin ele', 500, null)], 400), null);
});

test('sin altitud de referencia se cae a la regla de cercania', () => {
  assert.equal(elegirCima([cand('Cerca', 100, 300)], null).nombre, 'Cerca');
  assert.equal(elegirCima([cand('Lejos', 900, 300)], null), null);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test`
Expected: FAIL — `elegirCima is not a function` o error de importación.

- [ ] **Step 3: Implementar**

Añadir a `lib/nombres.js`:

```js
/* Un nodo cuya altitud difiera menos de esto de la cima real se
   considera que habla de la misma cumbre. */
const TOL_ALTITUD = 60;

/* Sin coincidencia de altitud solo se acepta un nodo muy pegado. */
const RADIO_CERCANIA = 300;

/*
  Elige que nodo de OpenStreetMap nombra esta cima.

  El criterio no es la distancia sola. Midiendo cerca de Sant Pere
  Martir, el pico mas proximo estaba a 360 m y el nombre correcto a
  709 m: quedarse con el mas cercano habria bautizado la subida con el
  nombre del turo de al lado. Como la altitud de la cima se conoce por
  el GPX, se usa para desempatar.
*/
export function elegirCima(candidatos, altCima) {
  if (!Array.isArray(candidatos) || !candidatos.length) return null;

  const conNombre = candidatos.filter((c) => c && c.nombre);
  if (!conNombre.length) return null;

  const porDistancia = (a, b) => a.distancia - b.distancia;

  /* 1. Los que cuadran en altitud, el mas cercano de ellos. */
  if (altCima != null) {
    const cuadran = conNombre.filter(
      (c) => c.altitud != null && Math.abs(c.altitud - altCima) <= TOL_ALTITUD
    );
    if (cuadran.length) return [...cuadran].sort(porDistancia)[0];
  }

  /* 2. Si ninguno cuadra, solo vale uno muy pegado. */
  const cerca = conNombre.filter((c) => c.distancia <= RADIO_CERCANIA);
  if (cerca.length) return [...cerca].sort(porDistancia)[0];

  /* 3. Antes que inventar un nombre, ninguno. */
  return null;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test`
Expected: PASS, 16 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/nombres.js tests/nombres.test.mjs
git commit -m "feat: elegir la cima de OSM desempatando por altitud"
```

---

### Task 3: Caché de nombres por proximidad

Las subidas detectadas se mueven cuando se cambian los mínimos de detección en Entrenamientos, así que una clave por índice o por coordenada redondeada se rompería. La caché busca por proximidad reutilizando el mismo radio de 250 m con el que `agruparAscensiones` ya decide qué es la misma subida.

**Files:**
- Modify: `lib/nombres.js`
- Modify: `tests/nombres.test.mjs`

**Interfaces:**
- Consumes: `distanciaGeo(a, b)` de `lib/metrics.js`, ya exportada en la línea 909. Recibe dos pares `[lat, lon]` y devuelve metros.
- Produces:
  - `buscarNombre(entradas, cima) -> {nombre, fuente} | null`
  - `guardarNombre(entradas, cima, nombre, fuente) -> entradas nuevas` (array nuevo, no muta)
  - `leerCache() -> entradas`
  - `escribirCache(entradas) -> void`
  - Tipo de entrada: `{lat: number, lon: number, nombre: string|null, fuente: 'strava'|'osm'|'manual'}`

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al final de `tests/nombres.test.mjs`:

```js
import { buscarNombre, guardarNombre } from '../lib/nombres.js';

const MONTJUIC = [41.3639, 2.1655];

test('sin entradas no encuentra nada', () => {
  assert.equal(buscarNombre([], MONTJUIC), null);
  assert.equal(buscarNombre(null, MONTJUIC), null);
});

test('encuentra una cima dentro del radio', () => {
  const e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  // unos 90 m mas al norte
  const r = buscarNombre(e, [41.3647, 2.1655]);
  assert.equal(r.nombre, 'Montjuïc');
  assert.equal(r.fuente, 'strava');
});

test('no encuentra una cima fuera del radio', () => {
  const e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  // unos 2 km al norte
  assert.equal(buscarNombre(e, [41.3820, 2.1655]), null);
});

test('el nombre manual gana al automatico en el mismo sitio', () => {
  let e = guardarNombre([], MONTJUIC, 'Sants-Montjuïc', 'osm');
  e = guardarNombre(e, [41.3641, 2.1657], 'Montjuïc per Miramar', 'manual');
  const r = buscarNombre(e, MONTJUIC);
  assert.equal(r.nombre, 'Montjuïc per Miramar');
  assert.equal(r.fuente, 'manual');
});

test('guardar dos veces el mismo sitio y fuente no duplica', () => {
  let e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  e = guardarNombre(e, [41.3640, 2.1656], 'Montjuïc', 'strava');
  assert.equal(e.length, 1);
});

test('guardar no muta el array original', () => {
  const original = [];
  const e = guardarNombre(original, MONTJUIC, 'Montjuïc', 'strava');
  assert.equal(original.length, 0);
  assert.equal(e.length, 1);
});

test('se cachea tambien el negativo para no repetir la consulta', () => {
  const e = guardarNombre([], MONTJUIC, null, 'osm');
  const r = buscarNombre(e, MONTJUIC);
  assert.notEqual(r, null);
  assert.equal(r.nombre, null);
});

test('sin coordenadas no se busca ni se guarda', () => {
  assert.equal(buscarNombre([{ lat: 1, lon: 1, nombre: 'X', fuente: 'osm' }], null), null);
  assert.equal(guardarNombre([], null, 'X', 'osm').length, 0);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npm test`
Expected: FAIL — `buscarNombre is not a function`.

- [ ] **Step 3: Implementar**

Añadir a `lib/nombres.js`. El `import` va arriba del archivo, con el resto:

```js
import { distanciaGeo } from './metrics.js';

/*
  Radio para dar dos cimas por la misma subida. Es el mismo que usa
  agruparAscensiones, y no por comodidad: si el panel ya considera que
  dos ascensos a menos de 250 m son el mismo puerto, el nombre tiene
  que viajar con ese mismo criterio o veriamos la misma subida agrupada
  bajo un nombre y sin el en otra pestana.
*/
const RADIO_NOMBRE = 250;

const CLAVE_CACHE = 'nombresSubidas';

/* Prioridad al recuperar: lo que has escrito tu manda sobre lo que
   adivino cualquier servicio. */
const PESO = { manual: 3, strava: 2, osm: 1 };

export function buscarNombre(entradas, cima) {
  if (!Array.isArray(entradas) || !entradas.length || !cima) return null;

  const cerca = entradas
    .map((e) => ({ e, d: distanciaGeo([e.lat, e.lon], cima) }))
    .filter((x) => x.d < RADIO_NOMBRE);

  if (!cerca.length) return null;

  cerca.sort((a, b) =>
    (PESO[b.e.fuente] || 0) - (PESO[a.e.fuente] || 0) || a.d - b.d);

  const { nombre, fuente } = cerca[0].e;
  return { nombre, fuente };
}

export function guardarNombre(entradas, cima, nombre, fuente) {
  const base = Array.isArray(entradas) ? entradas : [];
  if (!cima) return [...base];

  /* Se reemplaza la entrada de la misma fuente en el mismo sitio, para
     que reintentar una consulta no acumule duplicados. Las de otras
     fuentes se conservan: asi un nombre manual sobrevive a que el
     automatico se vuelva a resolver. */
  const resto = base.filter(
    (e) => !(e.fuente === fuente && distanciaGeo([e.lat, e.lon], cima) < RADIO_NOMBRE)
  );

  return [...resto, { lat: cima[0], lon: cima[1], nombre: nombre || null, fuente }];
}

/* ---------- persistencia ---------- */

export function leerCache() {
  if (typeof window === 'undefined') return [];
  try {
    const c = JSON.parse(window.localStorage.getItem(CLAVE_CACHE));
    return Array.isArray(c?.entradas) ? c.entradas : [];
  } catch {
    return [];
  }
}

export function escribirCache(entradas) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_CACHE,
      JSON.stringify({ version: 1, entradas }));
  } catch {
    /* Sin sitio en localStorage los nombres siguen valiendo en memoria
       durante la sesion. No es motivo para romper la pestana. */
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npm test`
Expected: PASS, 24 pruebas.

- [ ] **Step 5: Commit**

```bash
git add lib/nombres.js tests/nombres.test.mjs
git commit -m "feat: cache de nombres por proximidad, con el manual por encima"
```

---

### Task 4: Endpoint de segmentos de Strava

**Files:**
- Modify: `lib/strava.js`
- Create: `app/api/nombres/segmentos/route.js`

**Interfaces:**
- Consumes: `api(ruta, params)` de `lib/strava.js`.
- Produces: `traerSegmentos(id) -> {segmentos} | {error}` donde `segmentos` es `[{nombre, inicio, fin, categoria}]`. El endpoint `GET /api/nombres/segmentos?id=` devuelve `{segmentos}` o `{error}`.

- [ ] **Step 1: Añadir traerSegmentos a lib/strava.js**

Al final de `lib/strava.js`:

```js
/*
  Nombres de los segmentos que cruza una actividad.

  Solo se toma el nombre y los indices. Los datos numericos del segmento
  (longitud, desnivel, pendiente) se ignoran a proposito: son poco
  fiables y el panel ya los calcula por su cuenta desde los streams.
*/
export async function traerSegmentos(id) {
  const { datos, error } = await api(`/activities/${id}`, {
    include_all_efforts: 'true',
  });
  if (error) return { error };

  const efforts = Array.isArray(datos?.segment_efforts) ? datos.segment_efforts : [];

  return {
    segmentos: efforts
      .filter((e) => e?.segment?.name && e.start_index != null && e.end_index != null)
      .map((e) => ({
        nombre: e.segment.name,
        inicio: e.start_index,
        fin: e.end_index,
        categoria: e.segment.climb_category || 0,
      })),
  };
}
```

- [ ] **Step 2: Crear el endpoint**

Crear `app/api/nombres/segmentos/route.js`:

```js
import { NextResponse } from 'next/server';
import { leerSesion, traerSegmentos } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'falta_id' }, { status: 400 });

  const { segmentos, error } = await traerSegmentos(id);
  if (error) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json({ segmentos });
}
```

- [ ] **Step 3: Comprobar que compila y responde**

Run: `npm run build`
Expected: compila sin errores y aparece `/api/nombres/segmentos` en la lista de rutas.

Con `npm run dev` levantado y sin sesión:

Run: `curl -s "http://localhost:3000/api/nombres/segmentos?id=1"`
Expected: `{"error":"sin_sesion"}`

- [ ] **Step 4: Commit**

```bash
git add lib/strava.js app/api/nombres/segmentos/route.js
git commit -m "feat: endpoint de segmentos de Strava para nombrar subidas"
```

---

### Task 5: Endpoint de cimas de OpenStreetMap

Va en servidor no solo por el CORS: Overpass exige un `User-Agent` identificativo en sus condiciones de uso y un navegador tiene prohibido fijar esa cabecera.

**Files:**
- Create: `app/api/nombres/cima/route.js`

**Interfaces:**
- Consumes: `elegirCima(candidatos, altCima)` y `distanciaGeo(a, b)`.
- Produces: `GET /api/nombres/cima?lat=&lon=&alt=` devuelve `{nombre: string|null}` o `{error}`.

- [ ] **Step 1: Crear el endpoint**

Crear `app/api/nombres/cima/route.js`:

```js
import { NextResponse } from 'next/server';
import { elegirCima } from '@/lib/nombres';
import { distanciaGeo } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/* Radio de consulta amplio a proposito: un nodo lejano con la altitud
   correcta vale mas que uno pegado a una altitud que no cuadra, y hay
   que traerlo para poder compararlo. Quien decide es elegirCima. */
const RADIO_CONSULTA = 1000;

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const lat = parseFloat(p.get('lat'));
  const lon = parseFloat(p.get('lon'));
  const alt = p.get('alt') != null ? parseFloat(p.get('alt')) : null;

  if (!isFinite(lat) || !isFinite(lon)) {
    return NextResponse.json({ error: 'faltan_coordenadas' }, { status: 400 });
  }

  const q = `[out:json][timeout:20];(` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[natural=peak];` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[natural=saddle];` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[mountain_pass];` +
    `);out body;`;

  let datos;
  try {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        /* Overpass pide identificarse. Es un servicio de voluntarios y
           las peticiones anonimas se cortan antes. */
        'User-Agent': 'cuaderno-de-ruta (panel personal de ciclismo)',
      },
      body: `data=${encodeURIComponent(q)}`,
      cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json({ error: `overpass_${r.status}` }, { status: 502 });

    const texto = await r.text();
    /* Overpass devuelve una pagina XML cuando esta saturado, aunque se
       le pida JSON. Intentar parsearla revienta, asi que se trata como
       un fallo del servicio y punto. */
    try { datos = JSON.parse(texto); }
    catch { return NextResponse.json({ error: 'overpass_saturado' }, { status: 502 }); }
  } catch {
    return NextResponse.json({ error: 'overpass_inaccesible' }, { status: 502 });
  }

  const candidatos = (datos.elements || []).map((e) => ({
    nombre: e.tags?.name || null,
    distancia: distanciaGeo([lat, lon], [e.lat, e.lon]),
    altitud: e.tags?.ele != null ? parseFloat(e.tags.ele) : null,
  }));

  const elegida = elegirCima(candidatos, alt);
  return NextResponse.json({ nombre: elegida ? elegida.nombre : null });
}
```

- [ ] **Step 2: Comprobar que compila**

Run: `npm run build`
Expected: compila y aparece `/api/nombres/cima` en la lista de rutas.

- [ ] **Step 3: Comprobar contra Overpass de verdad**

Con `npm run dev` levantado:

Run: `curl -s "http://localhost:3000/api/nombres/cima?lat=41.3639&lon=2.1655&alt=173"`
Expected: `{"nombre":"Montjuïc"}`

Run: `curl -s "http://localhost:3000/api/nombres/cima?lat=41.35&lon=2.13"`
Expected: `{"nombre":null}` (en pleno Poble-sec no hay cima; no debe romper)

Si el primero devuelve `overpass_saturado`, esperar un minuto y repetir: es el servicio, no el código.

- [ ] **Step 4: Commit**

```bash
git add app/api/nombres/cima/route.js
git commit -m "feat: endpoint de cimas de OpenStreetMap via Overpass"
```

---

### Task 6: Nombres en Entrenamientos

Solo la salida que se está viendo. Una petición, y cacheada.

**Files:**
- Modify: `components/Entrenamientos.jsx`

**Interfaces:**
- Consumes: `emparejarSegmento`, `buscarNombre`, `guardarNombre`, `leerCache`, `escribirCache` de `lib/nombres.js`; `GET /api/nombres/segmentos?id=`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Añadir estado y carga de nombres**

En `components/Entrenamientos.jsx`, añadir a los imports:

```js
import {
  emparejarSegmento, buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';
```

Dentro del componente, junto al resto de estado:

```js
const [cacheNombres, setCacheNombres] = useState(() => leerCache());
const [segmentos, setSegmentos] = useState({});   // id de salida -> efforts

/*
  Los segmentos se piden solo de la salida abierta. El detalle de
  actividad cuesta una peticion, y el limite de Strava son 100 cada
  quince minutos: traerlos de todas las salidas al entrar dejaria el
  panel sin cuota para lo demas.
*/
useEffect(() => {
  if (!salida || segmentos[salida.id] !== undefined) return;
  let cancelado = false;
  (async () => {
    try {
      const r = await fetch(`/api/nombres/segmentos?id=${salida.id}`, { cache: 'no-store' });
      const j = await r.json();
      if (!cancelado) setSegmentos((s) => ({ ...s, [salida.id]: j.segmentos || [] }));
    } catch {
      if (!cancelado) setSegmentos((s) => ({ ...s, [salida.id]: [] }));
    }
  })();
  return () => { cancelado = true; };
}, [salida, segmentos]);
```

- [ ] **Step 2: Resolver el nombre de cada puerto**

Después de calcular `puertos`, añadir:

```js
/*
  Precedencia: lo que hayas escrito tu, luego el segmento de Strava, y
  si nada de eso hay, el numero de siempre.
*/
const nombresPuertos = useMemo(() => {
  const efforts = salida ? segmentos[salida.id] : null;
  return puertos.map((p, i) => {
    const cima = streams?.latlng ? streams.latlng[p.fin] : null;
    const guardado = buscarNombre(cacheNombres, cima);
    if (guardado?.fuente === 'manual' && guardado.nombre) return guardado.nombre;
    const deStrava = efforts ? emparejarSegmento(p, efforts) : null;
    return deStrava || guardado?.nombre || `Subida ${i + 1}`;
  });
}, [puertos, segmentos, salida, streams, cacheNombres]);
```

- [ ] **Step 3: Guardar en caché lo que resuelva Strava**

```js
/* Se guardan para que Mis ascensiones y las demas pestanas los
   aprovechen sin volver a gastar peticiones. */
useEffect(() => {
  const efforts = salida ? segmentos[salida.id] : null;
  if (!efforts || !efforts.length || !streams?.latlng) return;

  let nueva = cacheNombres, cambio = false;
  puertos.forEach((p) => {
    const cima = streams.latlng[p.fin];
    if (!cima) return;
    const n = emparejarSegmento(p, efforts);
    if (!n) return;
    const ya = buscarNombre(nueva, cima);
    if (ya?.fuente === 'strava' && ya.nombre === n) return;
    nueva = guardarNombre(nueva, cima, n, 'strava');
    cambio = true;
  });

  if (cambio) { setCacheNombres(nueva); escribirCache(nueva); }
}, [segmentos, salida, puertos, streams, cacheNombres]);
```

- [ ] **Step 4: Usar el nombre en la tabla y en el perfil**

En la línea que hoy pone `Subida {i + 1}` (alrededor de `Entrenamientos.jsx:291`), sustituir por:

```jsx
{nombresPuertos[i]}
```

Y en el `<PerfilPuerto>` de más abajo, añadir el prop `nombre`:

```jsx
<PerfilPuerto streams={streams} puerto={puertos[puertoAbierto]}
  indice={puertoAbierto} cfg={cfg} zonas={zonas}
  nombre={nombresPuertos[puertoAbierto]} />
```

`PerfilPuerto` ya acepta `nombre` y cae a `Subida N` si llega vacío (`PerfilPuerto.jsx:102`): no hay que tocarlo.

- [ ] **Step 5: Comprobar**

Run: `npm run build`
Expected: compila limpio.

Con `npm run dev` y la cuenta conectada: abrir una salida por Collserola en Entrenamientos y comprobar que las subidas muestran nombres reconocibles en vez de `Subida 1..4`.

Cambiar los mínimos de detección (longitud, desnivel, pendiente) y comprobar que los nombres siguen apareciendo. Es lo que verifica que la caché por proximidad aguanta que los tramos se muevan.

- [ ] **Step 6: Commit**

```bash
git add components/Entrenamientos.jsx
git commit -m "feat: nombres de segmento en los puertos de cada salida"
```

---

### Task 7: Mis ascensiones — quitar Nominatim y buscar bajo demanda

Aquí vive el intento anterior: `nombrarCima` llama a Nominatim desde el navegador (`Ascensiones.jsx:18`), falla por CORS y, aunque no fallara, acierta 1 de 4. Se sustituye entero.

**Files:**
- Modify: `components/Ascensiones.jsx`

**Interfaces:**
- Consumes: `buscarNombre`, `guardarNombre`, `leerCache`, `escribirCache`; `GET /api/nombres/cima?lat=&lon=&alt=`.
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Borrar nombrarCima y el efecto automático**

Eliminar de `components/Ascensiones.jsx`:
- La función `nombrarCima` completa (líneas 10-35, incluido su comentario de cabecera).
- El `useEffect` de "Nombres reales de las cimas, uno por segundo" (líneas 71-93).
- El estado `buscando` si deja de usarse en otro sitio.

- [ ] **Step 2: Añadir el nuevo estado y la búsqueda explícita**

Imports:

```js
import {
  buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';
```

Estado y acción:

```js
const [cacheNombres, setCacheNombres] = useState(() => leerCache());
const [buscando, setBuscando] = useState(false);
const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });

/* Las que tienen cima y todavia no sabemos como se llaman. */
const sinNombre = grupos.filter(
  (g) => g.cima && buscarNombre(cacheNombres, g.cima) === null
);

/*
  Altitud de la cima del grupo.

  agruparAscensiones guarda las coordenadas de la cima pero no su
  altura, asi que se recupera aqui: cada grupo apunta con streamsId y
  puertoRef a la salida y al puerto de referencia. Sin este dato
  elegirCima pierde su mejor criterio de desempate y se queda en
  "el nodo mas cercano", que es justo lo que da nombres equivocados.
*/
const altitudCima = (g) => {
  const st = cache?.[g.streamsId];
  const i = g.puertoRef?.fin;
  const a = st?.altitud;
  return a && i != null && a[i] != null ? Math.round(a[i]) : null;
};

/*
  Nunca automatico. Overpass es un servicio de voluntarios y en las
  pruebas fallo dos de cada seis consultas: dispararlas solo por entrar
  en la pestana seria abusar y ademas daria una lista a medias sin que
  el usuario entienda por que.
*/
const buscarNombres = async () => {
  setBuscando(true);
  setProgreso({ hechas: 0, total: sinNombre.length });

  let nueva = cacheNombres;
  for (let i = 0; i < sinNombre.length; i++) {
    const g = sinNombre[i];
    try {
      const a = altitudCima(g);
      const alt = a != null ? `&alt=${a}` : '';
      const r = await fetch(
        `/api/nombres/cima?lat=${g.cima[0]}&lon=${g.cima[1]}${alt}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      /* Se guarda tambien cuando no hay nombre: asi no se vuelve a
         preguntar por una cima que OSM no conoce. */
      nueva = guardarNombre(nueva, g.cima, j.nombre || null, 'osm');
    } catch {
      nueva = guardarNombre(nueva, g.cima, null, 'osm');
    }
    setCacheNombres(nueva);
    escribirCache(nueva);
    setProgreso({ hechas: i + 1, total: sinNombre.length });
    await new Promise((r) => setTimeout(r, 1100));
  }
  setBuscando(false);
};
```

- [ ] **Step 3: Sustituir nombreDe**

Reemplazar la línea `const nombreDe = (g, i) => nombres[g.id] || `Ascenso ${i + 1}`;` por:

```js
const nombreDe = (g, i) => buscarNombre(cacheNombres, g.cima)?.nombre || `Ascenso ${i + 1}`;
```

- [ ] **Step 4: Añadir el botón**

Justo debajo del `<p className="hint">` de la cabecera:

```jsx
{sinNombre.length > 0 && (
  <div className="callout">
    <strong>{sinNombre.length} subidas sin nombre.</strong> Se consultan las cimas en
    OpenStreetMap, de una en una y con pausa, porque es un servicio gratuito mantenido
    por voluntarios.
    <div style={{ marginTop: 12 }}>
      <button onClick={buscarNombres} disabled={buscando}>
        {buscando
          ? `Buscando… ${progreso.hechas} de ${progreso.total}`
          : `Buscar los ${sinNombre.length} nombres`}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Comprobar**

Run: `npm run build`
Expected: compila limpio, sin referencias sueltas a `nombrarCima` ni a `nombres`.

Run: `grep -rn "nominatim" components/ lib/`
Expected: sin resultados.

En local: pulsar el botón y ver la cuenta avanzar y aparecer nombres. Las subidas que Entrenamientos ya nombró vía Strava deben salir nombradas **sin** consultar nada, porque comparten la misma caché.

- [ ] **Step 6: Commit**

```bash
git add components/Ascensiones.jsx
git commit -m "feat: nombres de cima bajo demanda en Mis ascensiones, sin Nominatim"
```

---

### Task 8: Renombrado manual

Ninguna fuente automática acierta siempre. Poder corregir a mano es lo que cierra la funcionalidad.

**Files:**
- Modify: `components/Ascensiones.jsx`

**Interfaces:**
- Consumes: `guardarNombre`, `buscarNombre`, `escribirCache`.
- Produces: nada.

- [ ] **Step 1: Añadir el estado de edición**

```js
const [editando, setEditando] = useState(null);   // id del grupo
const [borrador, setBorrador] = useState('');

const guardarManual = (g) => {
  const limpio = borrador.trim();
  /* Guardar vacio equivale a volver al nombre automatico. */
  const nueva = limpio
    ? guardarNombre(cacheNombres, g.cima, limpio, 'manual')
    : cacheNombres.filter(
        (e) => !(e.fuente === 'manual' && distanciaGeo([e.lat, e.lon], g.cima) < 250)
      );
  setCacheNombres(nueva);
  escribirCache(nueva);
  setEditando(null);
};
```

Añadir `distanciaGeo` al import de `@/lib/metrics` que ya existe en el archivo.

- [ ] **Step 2: Añadir el control en la tabla**

En la celda del nombre de cada grupo, sustituir el texto plano por:

```jsx
{editando === g.id ? (
  <input
    autoFocus
    value={borrador}
    onChange={(e) => setBorrador(e.target.value)}
    onBlur={() => guardarManual(g)}
    onKeyDown={(e) => {
      if (e.key === 'Enter') guardarManual(g);
      if (e.key === 'Escape') setEditando(null);
    }}
    onClick={(e) => e.stopPropagation()}
    placeholder="Vacío para volver al automático"
    style={{ width: '100%', maxWidth: 260 }}
  />
) : (
  <span onClick={(e) => {
    e.stopPropagation();
    setEditando(g.id);
    setBorrador(buscarNombre(cacheNombres, g.cima)?.nombre || '');
  }}
    title="Pulsa para renombrar"
    style={{ cursor: 'text', borderBottom: '1px dotted var(--line2)' }}>
    {nombreDe(g, i)}
  </span>
)}
```

El `stopPropagation` es necesario: la fila entera ya tiene un `onClick` que despliega el detalle, y sin él editar el nombre abriría el panel a la vez.

- [ ] **Step 3: Comprobar**

Run: `npm run build`
Expected: compila limpio.

En local:
1. Renombrar una subida, pulsar Enter, recargar la página. El nombre debe seguir ahí.
2. Volver a Entrenamientos y abrir una salida con esa subida: debe salir el nombre manual, no el de Strava.
3. Vaciar el campo y guardar: debe volver el nombre automático.
4. Pulsar sobre el nombre no debe desplegar el detalle de la fila.

- [ ] **Step 4: Commit**

```bash
git add components/Ascensiones.jsx
git commit -m "feat: renombrar subidas a mano, por encima del nombre automatico"
```

---

### Task 9: Nombres en Rutas y en Analizar GPX

Estas rutas no están rodadas: no existen `segment_efforts`, así que solo cabe Overpass.

**Files:**
- Modify: `components/Rutas.jsx`
- Modify: `components/AnalizadorGPX.jsx`

**Interfaces:**
- Consumes: `buscarNombre`, `guardarNombre`, `leerCache`, `escribirCache`; `GET /api/nombres/cima`.
- Produces: nada.

- [ ] **Step 1: Añadir la resolución de nombres en Rutas**

En `components/Rutas.jsx`, dentro de `DetalleRuta`:

```js
const [cacheNombres, setCacheNombres] = useState(() => leerCache());

/*
  Una ruta guardada no se ha rodado, asi que no hay segmentos que
  consultar: aqui la unica fuente posible es la cima de OSM. Se piden
  solo las de la ruta abierta y de una en una.
*/
useEffect(() => {
  if (!an?.puertos?.length || !datos?.puntos) return;
  let cancelado = false;

  (async () => {
    let nueva = cacheNombres, cambio = false;
    for (const p of an.puertos) {
      if (cancelado) break;
      const pt = datos.puntos[p.fin];
      if (!pt) continue;
      const cima = [pt.lat, pt.lon];
      if (buscarNombre(nueva, cima)) continue;
      try {
        const r = await fetch(
          `/api/nombres/cima?lat=${pt.lat}&lon=${pt.lon}&alt=${Math.round(pt.ele)}`,
          { cache: 'no-store' });
        const j = await r.json();
        nueva = guardarNombre(nueva, cima, j.nombre || null, 'osm');
      } catch {
        nueva = guardarNombre(nueva, cima, null, 'osm');
      }
      cambio = true;
      if (!cancelado) { setCacheNombres(nueva); escribirCache(nueva); }
      await new Promise((r) => setTimeout(r, 1100));
    }
    if (cambio && !cancelado) escribirCache(nueva);
  })();

  return () => { cancelado = true; };
}, [an, datos, cacheNombres]);

const nombrePuerto = (p, i) => {
  const pt = datos?.puntos?.[p.fin];
  const n = pt ? buscarNombre(cacheNombres, [pt.lat, pt.lon])?.nombre : null;
  return n || `Subida ${i + 1}`;
};
```

Imports a añadir:

```js
import {
  buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';
```

- [ ] **Step 2: Usar el nombre en la tabla de subidas de Rutas**

En `components/Rutas.jsx`, sustituir `Subida {i + 1}` (alrededor de la línea 375) por:

```jsx
{nombrePuerto(p, i)}
```

Y añadir el prop al `<PerfilPuerto>` de esa misma sección:

```jsx
nombre={nombrePuerto(an.puertos[puerto], puerto)}
```

- [ ] **Step 3: Hacer lo mismo en AnalizadorGPX**

`components/AnalizadorGPX.jsx` tiene la misma forma de datos que Rutas: `datos` viene de `parseGPX` (con `puntos` de `lat`, `lon` y `ele`), `an` de `analizarRuta`, y usa `PerfilPuerto` en la línea 226.

Añadir a los imports:

```js
import {
  buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';
```

Dentro del componente, junto al resto de estado:

```js
const [cacheNombres, setCacheNombres] = useState(() => leerCache());

/*
  Un GPX subido no se ha rodado con Strava, asi que no hay segmentos
  que consultar: la unica fuente es la cima de OSM. De una en una y
  con pausa, porque Overpass lo mantienen voluntarios.
*/
useEffect(() => {
  if (!an?.puertos?.length || !datos?.puntos) return;
  let cancelado = false;

  (async () => {
    let nueva = cacheNombres;
    for (const p of an.puertos) {
      if (cancelado) break;
      const pt = datos.puntos[p.fin];
      if (!pt) continue;
      const cima = [pt.lat, pt.lon];
      if (buscarNombre(nueva, cima)) continue;
      try {
        const r = await fetch(
          `/api/nombres/cima?lat=${pt.lat}&lon=${pt.lon}&alt=${Math.round(pt.ele)}`,
          { cache: 'no-store' });
        const j = await r.json();
        nueva = guardarNombre(nueva, cima, j.nombre || null, 'osm');
      } catch {
        nueva = guardarNombre(nueva, cima, null, 'osm');
      }
      if (!cancelado) { setCacheNombres(nueva); escribirCache(nueva); }
      await new Promise((r) => setTimeout(r, 1100));
    }
  })();

  return () => { cancelado = true; };
}, [an, datos, cacheNombres]);

const nombrePuerto = (p, i) => {
  const pt = datos?.puntos?.[p.fin];
  const n = pt ? buscarNombre(cacheNombres, [pt.lat, pt.lon])?.nombre : null;
  return n || `Subida ${i + 1}`;
};
```

En la línea 210, sustituir `Subida {i + 1}` por:

```jsx
{nombrePuerto(p, i)}
```

Y en el `<PerfilPuerto>` de la línea 226, añadir el prop:

```jsx
nombre={nombrePuerto(an.puertos[abierto], abierto)}
```

- [ ] **Step 4: Comprobar**

Run: `npm run build`
Expected: compila limpio.

En local: abrir la ruta *Montjuic + Tibidabo* en Rutas y comprobar que al menos la subida de Montjuïc recibe nombre. Subir un GPX en Analizar GPX y comprobar lo mismo.

Comprobar también que una ruta sin cimas conocidas se queda en `Subida N` sin romper nada.

- [ ] **Step 5: Commit**

```bash
git add components/Rutas.jsx components/AnalizadorGPX.jsx
git commit -m "feat: nombres de cima en Rutas y en Analizar GPX"
```

---

### Task 10: Actualizar la documentación del proyecto

**Files:**
- Modify: `PROYECTO.md`

- [ ] **Step 1: Mover los pendientes resueltos**

En `PROYECTO.md`:
- Eliminar la sección *"Pendiente: Edición manual de nombres de ascensiones"*.
- Eliminar la sección *"Pendiente: Arreglar renombrado automático por Nominatim"*.
- Añadir a *Aprendizajes clave*:

```markdown
- Nominatim responde direcciones, no relieve: preguntado por cimas reales
  de la zona acierta 1 de 4 (devuelve el distrito o el municipio). Para
  nombrar puertos sirven los segmentos de Strava y los nodos de cima de
  OSM via Overpass, no la geocodificacion inversa
- Los segmentos de Strava son malos para medir un puerto pero son la
  mejor fuente para nombrarlo: es como lo llama un ciclista
- Los identificadores de Strava son enteros de 64 bits y JSON.parse los
  redondea. Hay que entrecomillarlos en el texto antes de parsear, o dos
  rutas distintas acaban con el mismo id
```

- [ ] **Step 2: Anotar lo que queda fuera**

Añadir a las próximas versiones:

```markdown
### Pendiente: sincronizar los nombres manuales entre dispositivos
Ahora viven en localStorage, asi que son de este navegador. Para que
viajen hace falta guardarlos en servidor.
```

- [ ] **Step 3: Commit**

```bash
git add PROYECTO.md
git commit -m "docs: actualizar pendientes y aprendizajes tras el nombrado de subidas"
```

---

## Verificación final

- [ ] `npm test` — 24 pruebas en verde.
- [ ] `npm run build` — compila limpio.
- [ ] `grep -rn "nominatim" components/ lib/` — sin resultados.
- [ ] En Entrenamientos, una salida por Collserola muestra nombres reconocibles.
- [ ] Cambiar los mínimos de detección no hace desaparecer los nombres.
- [ ] Un nombre manual sobrevive a recargar y gana al automático en todas las pestañas.
- [ ] Vaciar el nombre manual devuelve el automático.
- [ ] Con Overpass caído o sin red, las subidas se quedan en `Subida N` y ninguna pestaña se rompe.
- [ ] El resto del panel (Resumen, Carga y forma, Objetivos) sigue igual.
