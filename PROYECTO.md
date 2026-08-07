# Cuaderno de Ruta — Estado del Proyecto

## Versión actual
v3.2.0 — Desplegada en Vercel

## Estado de v3.2
✅ Completada e instalada en producción
- Paso fijo de 50 m en detalle de puertos (antes era adaptativo 50-1000m)
- Suavizado de altitud (ventana ~100m) para eliminar ruido de sensor a esa resolución
- Marcador visual de pendiente máxima en el perfil de cada puerto
- Etiquetas espaciadas por píxeles reales (sin solapes, sin amasijo de números)
- `text-wrap:pretty` eliminado de globals.css (causaba saltos de línea prematuros)
- Dificultad de puertos corregida (fórmula propia `indicePuerto`/`nivelDificultadPuerto`,
  separada de la de rutas completas — antes todo salía "Suave")
- Cabecera de información general en detalle de rutas (Distancia, Desnivel, Km
  equivalentes, Dificultad) — igual que en Entrenamientos
- Guardias contra respuestas rotas de Strava (antes un stream incompleto podía
  tumbar todo el panel con "Application error")

## Próximas versiones (v3.3+)

### Pendiente: Rediseño de "Carga y forma"
Especificación cerrada, lista para implementar:
- Trocear cada salida en tramos cortos (reutilizar `repartoDureza`/`TRAMOS_DUREZA`
  de lib/metrics.js, ya existen)
- Clasificar cada tramo por: zona FC (`zonaDeFC`, ya existe) × terreno local
  (Llano/Mixto/Montaña, por pendiente del tramo, no de la salida entera)
- Trazar evolución de velocidad (km/h) por cada combinación zona×terreno a
  lo largo del tiempo
- UI: pestañas de terreno (como ahora), dentro las 5 zonas superpuestas con
  su color
- Avisar con claridad cuando haya pocos datos por combinación (con ~20-30
  salidas, muchas de las 15 combinaciones zona×terreno tendrán 0-1 puntos)
- Sustituye por completo a `components/Evolucion.jsx` actual (que analiza
  la salida entera, no por tramos, y por eso mezcla terrenos distintos)

### Pendiente: Edición manual de nombres de ascensiones
- Botón "Renombrar" o campo editable en la tabla de "Mis ascensiones"
- Persistencia en localStorage por ahora (futuro: servidor para sincronizar
  entre dispositivos)

### Pendiente: Arreglar renombrado automático por Nominatim
- Ahora mismo la petición se hace desde el cliente y falla por CORS
- Solución: mover a un endpoint `/api/nombres?lat=&lon=` server-side en Next.js

## Herramientas y setup
- Stack: Next.js, Vercel, GitHub, Strava OAuth API (scope `read_all`)
- URL: https://entrenamiento-personal-ciclismo.vercel.app
- GitHub: BmfyPc11/entrenamiento-personal-ciclismo (privado)
- Local: C:\Users\alex_\OneDrive\Documentos\1_EntrenadorCiclisme\Entrenador_Main\cuaderno-de-ruta\ciclismo
- Nominatim/OpenStreetMap para geocoding inverso (1 req/s)

## Comandos clave
```bash
npm install
npm run dev        # desarrollo local
npm run build      # compilación de verificación
git add . && git commit -m "vX.X" && git push
```

## Flujo de actualización estándar
1. Copiar contenido nuevo a la carpeta local, conservando `.env.local`
2. `cd ciclismo && npm install`
3. `git add . && git commit -m "vX.X" && git push`
4. Esperar deploy en Vercel (2-3 min), recargar con Ctrl+Shift+R
5. Si cambia el scope de Strava: salir y reconectar Strava desde la app

## Estructura principal
- `components/` — componentes React (un archivo por pestaña principal)
- `lib/metrics.js` — todos los cálculos (zonas, dureza, dificultad, puertos...)
- `lib/gpx.js` — parseo y análisis de archivos GPX (para Rutas y Analizador)
- `lib/strava.js` — integración con la API de Strava
- `app/api/` — endpoints de Next.js (activities, streams, rutas...)
- `app/globals.css` — estilos globales

## Datos del ciclista (Alex)
- Peso: 72 kg · Bicicleta: 11 kg (gravel) · Posición: manos arriba
- FC máx: 186 ppm (testeada en campo)
- Entrena 2-4 días/semana · Zonas: Sant Boi, Llobregat delta, Zona Franca,
  Montjuïc, Collserola
- Objetivos: 30 km/h en Z2 en llano · subidas de 5 km al 6-7% o 2-3 km al 8-9%
- Hardware: Garmin (FC + altímetro barométrico)

## Aprendizajes clave (para no repetir errores)
- Los segmentos de Strava son poco fiables para analizar puertos: usar
  siempre streams propios (distancia/altitud), no datos de terceros
- A resoluciones finas (50m) el ruido del altímetro es real y hay que
  suavizar antes de calcular pendiente, o el "punto más duro" puede ser
  un artefacto del sensor
- Cualquier stream que llegue incompleto de Strava debe descartarse antes
  de guardarse en caché, nunca guardarse "a medias"
