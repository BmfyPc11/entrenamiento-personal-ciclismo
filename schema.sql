-- Schema de la base de datos ciclismo en Neon
-- Ejecuta este archivo en Neon para crear todas las tablas

-- Tabla de salidas (actividades de Strava)
CREATE TABLE IF NOT EXISTS salidas (
  id BIGINT PRIMARY KEY,
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

-- Tabla de logros/achievements
CREATE TABLE IF NOT EXISTS logros (
  id SERIAL PRIMARY KEY,
  salida_id BIGINT NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  tipo VARCHAR(100),
  dato VARCHAR(255)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_salidas_fecha ON salidas(fecha);
CREATE INDEX IF NOT EXISTS idx_segmentos_salida_id ON segmentos(salida_id);
CREATE INDEX IF NOT EXISTS idx_nombres_cima_location ON nombres_cima(lat, lon);
