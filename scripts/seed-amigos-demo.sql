-- ============================================================
-- Dos amigos de mentira para probar la pestana "Amigos" en local,
-- con cifras de nivel profesional. Los nombres son de ciclistas
-- reales pero TODOS los numeros son inventados y solo ilustrativos.
--
-- NO ejecutar en produccion. Ejecuta el bloque SEED, prueba, y al
-- terminar el bloque LIMPIEZA.
--
-- Si vuelves a sembrar sin limpiar antes, los splits se duplican
-- (inofensivo: se coge el minimo) pero las salidas no (ON CONFLICT).
-- ============================================================

-- ======================= SEED =======================

INSERT INTO atletas (id, nombre) VALUES
 (990002, 'Tadej Pogačar (demo)'),
 (990003, 'Enric Mas (demo)')
ON CONFLICT (id) DO NOTHING;

-- ---- Volumen: ~220 salidas por atleta repartidas en ~500 dias ----
-- distancia en METROS, tiempo_movimiento en SEGUNDOS, desnivel en METROS.
-- Casi todas son de montana (mucho desnivel): da igual para el volumen,
-- que no mira el tipo de terreno.

INSERT INTO salidas (id, athlete_id, nombre, tipo, fecha, distancia, tiempo_movimiento, desnivel)
SELECT
  990002000000 + g,
  990002,
  'Entreno ' || g,
  'Ride',
  now() - (g * 55 || ' hours')::interval,
  150000 + (g % 8) * 12000,                                  -- 150-234 km
  round((150000 + (g % 8) * 12000) / 10.0)::int,             -- ~36 km/h de media
  1800 + (g % 6) * 700                                       -- 1800-5300 m
FROM generate_series(0, 219) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO salidas (id, athlete_id, nombre, tipo, fecha, distancia, tiempo_movimiento, desnivel)
SELECT
  990003000000 + g,
  990003,
  'Entreno ' || g,
  'Ride',
  now() - (g * 58 || ' hours')::interval,
  140000 + (g % 8) * 11000,                                  -- 140-217 km
  round((140000 + (g % 8) * 11000) / 9.7)::int,              -- ~35 km/h de media
  2000 + (g % 6) * 800                                       -- 2000-6000 m
FROM generate_series(0, 209) AS g
ON CONFLICT (id) DO NOTHING;

-- ---- Marcas de split: una crono llana por atleta + sus 5 tramos ----
-- desnivel bajo a proposito: mejoresSplits solo cuenta salidas "llanas".

INSERT INTO salidas (id, athlete_id, nombre, tipo, fecha, distancia, tiempo_movimiento, desnivel) VALUES
 (990002999999, 990002, 'Crono llano', 'Ride', now() - interval '9 days',  95000, 7300, 240),
 (990003999999, 990003, 'Crono llano', 'Ride', now() - interval '13 days', 95000, 7700, 300)
ON CONFLICT (id) DO NOTHING;

-- dato = segundos. Pogacar un peldano mas rapido que Mas en el llano.
INSERT INTO logros (salida_id, tipo, dato) VALUES
 -- Tadej Pogačar (demo)
 (990002999999, '5km',  '360'),   -- 50.0 km/h
 (990002999999, '10km', '750'),   -- 48.0 km/h
 (990002999999, '20km', '1560'),  -- 46.2 km/h
 (990002999999, '40km', '3240'),  -- 44.4 km/h
 (990002999999, '80km', '6720'),  -- 42.9 km/h
 -- Enric Mas (demo)
 (990003999999, '5km',  '380'),   -- 47.4 km/h
 (990003999999, '10km', '795'),   -- 45.3 km/h
 (990003999999, '20km', '1650'),  -- 43.6 km/h
 (990003999999, '40km', '3450'),  -- 41.7 km/h
 (990003999999, '80km', '7200');  -- 40.0 km/h

-- ===================== LIMPIEZA =====================
-- (logros se borra solo por ON DELETE CASCADE de salidas)
-- DELETE FROM salidas WHERE athlete_id IN (990002, 990003);
-- DELETE FROM atletas WHERE id IN (990002, 990003);
