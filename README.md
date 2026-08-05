# Cuaderno de ruta

Panel de análisis de entrenamiento en bicicleta conectado a tu cuenta de Strava.

---

## Puesta en marcha

Son tres pasos y unos veinte minutos. No hace falta saber programar, pero sí seguir el orden.

### 1. Crea tu aplicación en Strava

1. Entra en **https://www.strava.com/settings/api** con tu cuenta.
2. Rellena el formulario:
   - **Application Name:** Cuaderno de ruta
   - **Category:** Training
   - **Website:** `http://localhost:3000` (luego lo cambias)
   - **Authorization Callback Domain:** `localhost` — **solo el dominio, sin `http://` y sin barras**
3. Sube cualquier imagen como icono y dale a *Create*.
4. Se te quedan a la vista dos datos que vas a necesitar: **Client ID** y **Client Secret**.
   El *secret* es una contraseña: no lo publiques ni lo subas a GitHub.

### 2. Arráncalo en tu ordenador

Necesitas tener instalado [Node.js](https://nodejs.org) (versión 18 o superior).

```bash
npm install
cp .env.example .env.local
```

Abre `.env.local` con cualquier editor de texto y pega tus dos claves:

```
STRAVA_CLIENT_ID=123456
STRAVA_CLIENT_SECRET=el_secreto_largo_que_te_dio_strava
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Y lo arrancas:

```bash
npm run dev
```

Abre **http://localhost:3000** y pulsa *Conectar con Strava*. Ya deberías ver tus datos.

> En la pantalla de permisos de Strava, deja marcada la casilla de **ver tus actividades privadas**.
> Sin ese permiso el panel no puede leer nada.

### 3. Súbelo a internet (opcional)

Si quieres consultarlo desde el móvil sin tener el ordenador encendido:

1. Sube el proyecto a un repositorio de **GitHub** (privado, si prefieres).
2. Entra en **https://vercel.com**, crea una cuenta e importa ese repositorio.
3. Antes de desplegar, en *Environment Variables*, añade las tres variables:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `NEXT_PUBLIC_APP_URL` → aquí va la URL que te dé Vercel, por ejemplo
     `https://cuaderno-de-ruta.vercel.app` (sin barra al final)
4. Despliega.
5. **Último paso, importante:** vuelve a https://www.strava.com/settings/api y cambia
   *Authorization Callback Domain* por tu dominio de Vercel, sin `https://`:
   `cuaderno-de-ruta.vercel.app`

Si te saltas el paso 5, Strava rechazará el login con un error de dominio.

---

## Qué hay dentro

| Pestaña | Qué te enseña |
|---|---|
| **Resumen** | Totales, progreso hacia tus objetivos y qué salidas entran en el análisis |
| **Entrenamientos** | Una salida concreta: perfil, puertos detectados y zonas de FC sobre el perfil |
| **Llano** | Progresión de velocidad y qué potencia exige cada velocidad |
| **Subida** | Tus mejores ascensos, VAM por salida y calculadora de puertos |
| **Carga y forma** | Condición, fatiga y forma en el tiempo, más el reparto por zonas |
| **Proyección** | Tendencia hacia los 30 km/h y qué esperar del test de FTP |

### El apartado Entrenamientos

Es el corazón del panel:

- **Desplegable** con todas tus salidas en bici, de la más reciente a la más antigua.
- **Perfil de altimetría** interactivo: pasa el cursor y ves altitud y pulsaciones en cada punto.
- **Puertos detectados automáticamente**, con longitud, desnivel, pendiente media, pendiente máxima
  sostenida, tiempo, VAM, frecuencia cardíaca y potencia estimada. Puedes ajustar qué cuenta como
  puerto con los tres mínimos (longitud, desnivel y pendiente).
- **Modo zonas**: el perfil se repinta con el color de la zona de frecuencia cardíaca en la que ibas
  en cada momento. Pulsando una zona concreta, el resto se atenúa y ves exactamente en qué tramos
  estuviste en ella. Si la salida no tiene pulsómetro, el botón sale desactivado.

---

## Cómo se calculan las cosas

**Potencia.** Si tienes medidor, se usa el dato real. Si no, se estima con física de ciclismo:
gravedad, resistencia a la rodadura y resistencia del aire, a partir de tu peso, el desnivel, la
distancia y el tiempo. Es fiable para comparar sesiones entre sí, pero no sustituye a un potenciómetro.

**Detección de puertos.** Cada tramo se puntúa como *desnivel ganado menos pendiente mínima por
distancia*, de modo que lo llano puntúa negativo. Buscando el tramo de puntuación máxima, los
extremos se recortan solos justo donde empieza y acaba la subida de verdad. Así un puerto de 4 km
al 7 % no aparece como uno de 9 km al 3 % por haberle pegado el llaneo de aproximación.

**Zonas.** Cinco zonas por porcentaje de tu frecuencia cardíaca máxima: por debajo del 60 %,
60–70 %, 70–80 %, 80–90 % y por encima del 90 %. Ajusta tu FC máxima en *Tus constantes*.

**Carga, fatiga y forma.** Cada sesión genera una carga proporcional a su duración y a su
intensidad relativa a tu umbral. La condición es la media exponencial a 42 días, la fatiga a 7 días,
y la forma es la diferencia. Ojo: la serie arranca de cero en tu primera salida, así que las primeras
semanas están artificialmente bajas.

**Umbral estimado.** Se calcula desde tus mejores ascensos sostenidos, corrigiendo por duración.
No sustituye a un test de FTP de 20 minutos: es una aproximación para que el panel tenga una
referencia con la que trabajar mientras tanto.

---

## Sobre tus datos

- Los tokens de Strava se guardan en una cookie del navegador, marcada como `httpOnly`, así que
  ningún script de la página puede leerlos.
- **No se guarda ninguna actividad en ningún servidor.** Cada vez que abres el panel, los datos
  viajan de Strava a tu navegador y se quedan ahí.
- Solo se piden permisos de lectura. La aplicación no puede escribir ni borrar nada en tu cuenta.
- Puedes revocar el acceso cuando quieras desde https://www.strava.com/settings/apps

---

## Problemas frecuentes

**«Bad Request» o error de dominio al conectar.**
El *Authorization Callback Domain* de Strava no coincide con tu URL. Debe ser solo el dominio:
`localhost` en local, `tu-proyecto.vercel.app` en Vercel. Sin `https://` y sin barras.

**«Strava ha alcanzado su límite de peticiones».**
Strava permite 100 peticiones cada 15 minutos. Cada salida que abres en *Entrenamientos* gasta una.
Espera un cuarto de hora y sigue. Los perfiles ya cargados se quedan en memoria mientras no recargues
la página.

**No aparecen mis salidas privadas.**
Volviste a conectar sin marcar el permiso de actividades privadas. Revoca el acceso en
https://www.strava.com/settings/apps y vuelve a conectar dejando la casilla marcada.

**Las potencias me parecen bajas.**
Revisa tu peso y el peso de la bici en *Tus constantes*. Son el factor que más mueve el cálculo.
