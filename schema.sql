-- Schema de la base de datos ciclismo en Neon
-- Ejecuta este archivo en Neon para crear todas las tablas

-- Tabla de salidas (actividades de Strava)
CREATE TABLE IF NOT EXISTS salidas (
  id BIGINT PRIMARY KEY,
  athlete_id BIGINT NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  tipo VARCHAR(50),
  fecha TIMESTAMP NOT NULL,
  distancia NUMERIC,
  tiempo_movimiento INTEGER,
  tiempo_total INTEGER,
  desnivel NUMERIC,
  vel_media NUMERIC,
  vel_max NUMERIC,
  fc_media NUMERIC,
  fc_max NUMERIC,
  vatios NUMERIC,
  vatios_reales NUMERIC,
  calorias NUMERIC,
  esfuerzo NUMERIC,
  personas INTEGER,
  fotos INTEGER,
  kudos INTEGER,
  comentarios INTEGER,
  prs INTEGER,
  logros_strava INTEGER
);

-- Atletas que han conectado su Strava alguna vez. Se rellena en el login
-- (registrarAtleta en lib/repo.js): el nombre de cada ciclista vive si no
-- solo en su cookie de sesion. De aqui sale la lista de la pestana
-- "Amigos", donde se comparan resultados entre ciclistas conectados
-- -pool abierto, sin solicitudes: quien conecta es comparable con el resto.
CREATE TABLE IF NOT EXISTS atletas (
  id BIGINT PRIMARY KEY,
  nombre VARCHAR(255)
);

-- Tabla de streams (datos del sensor: distancia, altitud, FC, etc.)
-- Los datos se guardan como arrays JSON
CREATE TABLE IF NOT EXISTS streams (
  salida_id BIGINT PRIMARY KEY REFERENCES salidas(id) ON DELETE CASCADE,
  distancia JSONB,
  altitud JSONB,
  fc JSONB,
  tiempo JSONB,
  velocidad JSONB,
  cadencia JSONB,
  vatios JSONB,
  latlng JSONB
);

-- Dos tablas retiradas en 2026-09, al pasar el nombrado de puertos a una
-- unica fuente -el catalogo de segmentos_manuales, cruzado por coordenadas,
-- la misma que usa el perfil de una salida real- sin servicios externos:
--   segmentos     -> puertos detectados en Strava (segment_efforts); se
--                    escribian en cada sync pero ya nadie los leia.
--   nombres_cima  -> cache de nombres de cima via OpenStreetMap/Overpass.
DROP TABLE IF EXISTS segmentos;
DROP TABLE IF EXISTS nombres_cima;

-- Segmentos marcados a mano en el perfil de una salida (ver Perfil, modo "marcado").
-- Se identifican por coordenadas, no por indices de stream de una salida concreta,
-- para poder reconocerlos en cualquier salida futura que pase por el mismo sitio.
-- metros es la longitud real del tramo (no la linea recta pie-cima): sirve para
-- descartar un pie+cima que coincidan por coordenadas pero por un camino distinto
-- (ver encontrarSegmentoManual en lib/metrics.js).
-- Dos vertientes de la misma subida (una version reducida, un desvio que llega
-- al mismo alto por otro camino...) se vinculan solas si comparten "nombre"
-- -no hace falta ninguna tabla ni columna aparte, ver recogerSegmentosManuales.
-- nombre_vertiente es aparte: la etiqueta propia de ESA vertiente (por ejemplo
-- "Corta" o "Por el norte"), para distinguirlas en el selector de Ascensiones.jsx
-- ya que todas comparten el mismo "nombre". Sin ella se etiquetan solas por su
-- longitud.
-- Sin athlete_id: es un dato de un solo ciclista, no por atleta.
CREATE TABLE IF NOT EXISTS segmentos_manuales (
  id VARCHAR(40) PRIMARY KEY,
  nombre VARCHAR(255),
  nombre_vertiente VARCHAR(255),
  lat_inicio NUMERIC NOT NULL,
  lon_inicio NUMERIC NOT NULL,
  lat_fin NUMERIC NOT NULL,
  lon_fin NUMERIC NOT NULL,
  metros NUMERIC
);

-- Anadir la columna a bases de datos que ya tenian la tabla creada sin ella
-- (CREATE TABLE IF NOT EXISTS no la habria tocado). Es un no-op si ya existe.
ALTER TABLE segmentos_manuales ADD COLUMN IF NOT EXISTS nombre_vertiente VARCHAR(255);

-- "actualizado" es la version del catalogo: se pone a now() al crear o editar
-- un segmento. La sincronizacion re-escanea contra puertos_hechos toda salida
-- cuyo streams.puertos_calc sea anterior a MAX(actualizado). Borrar un segmento
-- no exige re-escaneo: sus filas de puertos_hechos caen por ON DELETE CASCADE.
ALTER TABLE segmentos_manuales ADD COLUMN IF NOT EXISTS actualizado TIMESTAMP NOT NULL DEFAULT now();

-- Marca de que salida ya tiene calculados sus puertos_hechos, y contra que
-- version del catalogo (ver segmentos_manuales.actualizado). NULL = nunca.
ALTER TABLE streams ADD COLUMN IF NOT EXISTS puertos_calc TIMESTAMP;

-- Cada paso de una salida por un segmento marcado a mano, ya medido: para
-- comparar tiempos y VAM entre ciclistas en la pestana "Amigos" sin volver a
-- tocar los streams (que son enormes). Lo llena /api/sync. inicio va en la
-- clave para que las repeticiones dentro de una misma salida (series,
-- intervalos en la misma cuesta) cuenten cada una por separado.
CREATE TABLE IF NOT EXISTS puertos_hechos (
  athlete_id BIGINT NOT NULL,
  segmento_id VARCHAR(40) NOT NULL REFERENCES segmentos_manuales(id) ON DELETE CASCADE,
  salida_id BIGINT NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  inicio INTEGER NOT NULL,
  fecha TIMESTAMP NOT NULL,
  segundos INTEGER,
  vam NUMERIC,
  desnivel NUMERIC,
  metros NUMERIC,
  PRIMARY KEY (salida_id, segmento_id, inicio)
);
CREATE INDEX IF NOT EXISTS idx_puertos_hechos_athlete ON puertos_hechos(athlete_id);
CREATE INDEX IF NOT EXISTS idx_puertos_hechos_segmento ON puertos_hechos(segmento_id);

-- Tabla de logros/achievements
CREATE TABLE IF NOT EXISTS logros (
  id SERIAL PRIMARY KEY,
  salida_id BIGINT NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  tipo VARCHAR(100),
  dato VARCHAR(255)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_salidas_athlete_id ON salidas(athlete_id);
CREATE INDEX IF NOT EXISTS idx_salidas_fecha ON salidas(fecha);
