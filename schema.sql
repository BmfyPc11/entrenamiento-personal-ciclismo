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

-- Tabla de segmentos (puertos/climbs detectados en Strava)
CREATE TABLE IF NOT EXISTS segmentos (
  id SERIAL PRIMARY KEY,
  salida_id BIGINT NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  nombre VARCHAR(255),
  inicio INTEGER,
  fin INTEGER,
  categoria INTEGER
);

-- Tabla de nombres manuales de cimas
-- Sirve para cache de nombres que el usuario ha editado manualmente
CREATE TABLE IF NOT EXISTS nombres_cima (
  id SERIAL PRIMARY KEY,
  lat NUMERIC NOT NULL,
  lon NUMERIC NOT NULL,
  nombre VARCHAR(255),
  fuente VARCHAR(50), -- 'manual', 'strava', 'osm'
  UNIQUE(lat, lon, fuente)
);

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
-- Sin athlete_id: como nombres_cima, es un dato de un solo ciclista.
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
CREATE INDEX IF NOT EXISTS idx_segmentos_salida_id ON segmentos(salida_id);
CREATE INDEX IF NOT EXISTS idx_nombres_cima_location ON nombres_cima(lat, lon);
