# Nombres reales de las subidas

## Contexto

Las subidas detectadas se muestran hoy como `Subida 1`, `Subida 2`… en Entrenamientos,
Rutas y Analizar GPX, y como `Ascenso N` en Mis ascensiones. Cuando el panel lista cuatro
subidas de una salida por Collserola, esos números no dicen nada: no se sabe cuál era
Montjuïc y cuál Sant Pere Màrtir, y comparar la misma subida entre salidas obliga a
cruzar kilometrajes a mano.

Ya hubo un intento previo. `Ascensiones.jsx` llama a Nominatim desde el navegador y falla
por CORS, y en `PROYECTO.md` quedó anotado como pendiente con la solución "moverlo a un
endpoint server-side".

**Ese diagnóstico era incompleto.** Al medir qué devuelve Nominatim para cimas reales de
la zona, acierta 1 de 4:

| Puerto | Nominatim devuelve |
|---|---|
| Montjuïc | Sants-Montjuïc (distrito) |
| Tibidabo | el Tibidabo ✓ |
| Sant Pere Màrtir | Sant Just Desvern (municipio) |
| Creu d'Olorda | Sarrià - Sant Gervasi (distrito) |

Nominatim hace geocodificación inversa de **direcciones**: responde en qué barrio estás,
no en qué cima. El campo `peak` que busca el código actual no llega nunca, porque las
cimas en OSM son nodos independientes y no componentes de una dirección. Arreglar solo el
CORS habría dejado el problema intacto con mejor aspecto.

## Decisiones

| Decisión | Elegido | Motivo |
|---|---|---|
| Fuente principal | Segmentos de Strava | Nombres que usa un ciclista, y ya hay sesión autenticada |
| Fuente de reserva | Overpass (nodos OSM) | Cubre lo que Strava no marca; medido y funcionando |
| Nominatim | **Descartado** | Mide direcciones, no relieve. 1 de 4 aciertos |
| Renombrado manual | Incluido ahora | Ninguna fuente automática acierta siempre |
| Carga de nombres | Nunca en masa | El detalle de actividad cuesta una petición por salida |

Sobre los segmentos de Strava: `PROYECTO.md` advierte que son poco fiables. Esa lección
era sobre **analizar** puertos con los datos del segmento (longitud, pendiente), y sigue
vigente. Para **nombrar** son la fuente más autorizada que existe, y no se toma de ellos
ningún dato numérico.

## Arquitectura

### Fuente según el contexto

Las salidas rodadas y las rutas planificadas no tienen los mismos datos, así que cada una
usa lo mejor que tiene a mano:

| Pestaña | Fuente | Por qué |
|---|---|---|
| Entrenamientos, Mis ascensiones | Segmentos de Strava | Están rodadas: existen `segment_efforts` |
| Rutas, Analizar GPX | Overpass | No rodadas: solo hay coordenadas |

### Precedencia

```
nombre manual  >  segmento de Strava  >  cima de OSM  >  "Subida N"
```

El nombre manual gana siempre y nunca se sobrescribe automáticamente.

### Endpoints nuevos (ambos server-side)

Van en servidor por dos razones, no solo el CORS: Overpass y Nominatim exigen un
`User-Agent` identificativo en sus condiciones de uso, y un navegador tiene prohibido
fijar esa cabecera.

**`GET /api/nombres/segmentos?id=<actividad>`**
Pide a Strava `/activities/{id}?include_all_efforts=true` a través de `api()` y devuelve
solo lo necesario: `[{ nombre, inicio, fin, categoria }]`, donde `nombre` viene de
`segment.name`, `inicio`/`fin` de `start_index`/`end_index` y `categoria` de
`segment.climb_category` (0 = sin catalogar, 1-5 = puerto). Reutiliza `api()`, así que
hereda el manejo de token, el refresco y la protección de ids de 64 bits.

**`GET /api/nombres/cima?lat=&lon=&alt=`**
Consulta Overpass por nodos `natural=peak`, `natural=saddle` y `mountain_pass` en 1000 m.
Devuelve `{ nombre, distancia, altitud }` o `{ nombre: null }`.

### Emparejar subida con segmento

`detectarPuertos` devuelve `inicio` y `fin`, que son índices dentro de los streams
(`lib/metrics.js:215`). Los `segment_efforts` de Strava traen `start_index`/`end_index`
sobre esos mismos streams. El emparejado es por solapamiento de índices, sin geometría:

1. Solapamiento = `min(fin, endIdx) - max(inicio, inicioIdx)`.
2. Se descartan los que solapen menos del 50 % del más corto de los dos tramos.
3. De los que quedan gana el de `categoria > 0` (Strava lo considera puerto); a igualdad,
   el de mayor solapamiento.

### Elegir la cima en Overpass

**Desempatar por altitud, no solo por cercanía.** En las pruebas, para un punto cerca de
Sant Pere Màrtir el pico más próximo estaba a 360 m y el nombre correcto a 709 m. Como la
altitud de la cima se conoce por el GPX, sirve de desempate.

La consulta pide un radio amplio de **1000 m**, pero aceptar el resultado es más estricto.
Sobre los candidatos devueltos, y descartando siempre los que no tengan `name`:

1. Los que tengan `ele` a menos de 60 m de la altitud real de la cima → gana el más cercano.
2. Si ninguno cumple, el más cercano **dentro de 300 m**, sea cual sea su altitud.
3. Si tampoco, `null` y se queda `Subida N`.

El radio de consulta es mayor que el de aceptación a propósito: un candidato lejano con la
altitud correcta (regla 1) vale más que uno próximo a una altitud que no cuadra, y por eso
hay que traerlo aunque quede fuera de los 300 m.

## Caché y persistencia

`agruparAscensiones` ya considera "la misma subida" cuando dos cimas caen a menos de
**250 m** (`lib/metrics.js:928`). La caché de nombres reutiliza ese mismo criterio en vez
de inventar una clave nueva, de modo que nombrar Montjuïc una vez lo nombra en todas sus
repeticiones.

No se usa una clave de texto: las subidas detectadas se mueven cuando el usuario cambia
los mínimos de longitud, desnivel o pendiente en Entrenamientos, y una clave por índice o
por coordenada redondeada se rompería con ese cambio.

Estructura en `localStorage`, clave `nombresSubidas`:

```json
{
  "version": 1,
  "entradas": [
    { "lat": 41.3639, "lon": 2.1655, "nombre": "Montjuïc", "fuente": "strava" }
  ]
}
```

Búsqueda: la entrada más próxima dentro de 250 m, reutilizando `distanciaGeo`. Las de
`fuente: "manual"` tienen prioridad sobre cualquier otra en el mismo radio.

Una subida sin `latlng` no se puede nombrar ni cachear: se queda en `Subida N`.
`agruparAscensiones` ya marca ese caso con `sinCoordenadas`.

## Límite de peticiones

Es la restricción que condiciona el diseño. El detalle de actividad cuesta **una petición
por salida**, y el límite de Strava son 100 cada 15 minutos, ya justo con lo que el panel
hace hoy.

Por eso:

- **Entrenamientos**: se piden los segmentos solo de la salida que se está viendo.
- **Mis ascensiones**: nunca automático. Botón explícito *"Buscar nombres"* que recorre
  las pendientes de una en una, con la cuenta a la vista y opción de parar.
- **Overpass**: una consulta por subida, espaciadas ~1 s, y solo bajo la misma acción
  explícita. Es un servicio de voluntarios y en las pruebas falló 2 de 6 veces.
- Todo resultado, incluido el negativo, se guarda en caché para no repetir la consulta.

## Renombrado manual

- Campo editable o botón *Renombrar* en la tabla de Mis ascensiones.
- Se guarda como entrada con `fuente: "manual"` en la misma caché.
- Gana sobre lo automático y no se sobrescribe nunca.
- Poder borrar el nombre manual para volver al automático.

## Degradación

Nada de esto puede romper lo que ya funciona. Si falla el nombrado, se ve `Subida N`,
igual que hoy:

- Strava responde error o la salida no tiene segmentos → se intenta OSM.
- Overpass falla o no devuelve nodo → `Subida N`, y se cachea el negativo.
- Sin `latlng` en los streams → `Subida N`, sin consultar nada.
- `localStorage` lleno o inaccesible → los nombres funcionan en memoria durante la sesión.

## Qué NO entra

- Nombrar subidas en **Rutas** y **Analizar GPX** mediante segmentos: esas rutas no están
  rodadas y no tienen *efforts*. Usan solo Overpass.
- Sincronizar los nombres manuales entre dispositivos: `localStorage` es local. Queda
  anotado como futuro en `PROYECTO.md`.
- Tomar de los segmentos cualquier dato numérico. Solo el nombre.

## Verificación

1. `npm run build` limpio.
2. Prueba unitaria del emparejado por solapamiento de índices, con casos de solape
   parcial, solape total y solape insuficiente.
3. Prueba unitaria de la elección de cima: candidato correcto lejano frente a uno cercano
   con altitud que no cuadra (el caso Sant Pere Màrtir medido).
4. Prueba unitaria de la búsqueda en caché por proximidad: dentro y fuera de los 250 m, y
   que `manual` gana a `strava`.
5. En local con la cuenta real: abrir una salida por Collserola en Entrenamientos y
   comprobar que las subidas reciben nombre reconocible.
6. Comprobar que al cambiar los mínimos de detección los nombres siguen apareciendo — es
   lo que verifica que la caché por proximidad aguanta el movimiento de los tramos.
7. Renombrar una subida a mano, recargar y confirmar que persiste y que no la pisa el
   nombrado automático.
8. Con el navegador sin red hacia Overpass, confirmar que se degrada a `Subida N` sin
   romper la pestaña.
