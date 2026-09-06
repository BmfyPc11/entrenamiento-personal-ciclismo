-- ============================================================
-- Amigo de mentira para probar la pestana "Amigos" en local.
-- NO ejecutar en produccion. Ejecuta el bloque SEED, prueba, y
-- cuando termines ejecuta el bloque LIMPIEZA.
--
-- El id 999001 y los ids de salida 9990000xx son inventados y no
-- chocan con los de Strava (que son mucho mas grandes... o parecidos,
-- por eso van tan altos: ajusta si alguna vez coinciden).
-- ============================================================

-- ---------- SEED ----------

INSERT INTO atletas (id, nombre) VALUES (999001, 'Amigo Pruebas')
ON CONFLICT (id) DO NOTHING;

-- Salidas llanas suyas. distancia en METROS, tiempo_movimiento en SEGUNDOS.
-- Poco desnivel a proposito: mejoresSplits solo cuenta salidas "llanas".
INSERT INTO salidas (id, athlete_id, nombre, tipo, fecha, distancia, tiempo_movimiento, desnivel) VALUES
 (999000001, 999001, 'Rodaje llano', 'Ride', now() - interval '5 days',  45000,  5400, 120),
 (999000002, 999001, 'Salida larga', 'Ride', now() - interval '20 days', 90000, 12000, 400),
 (999000003, 999001, 'Tirada corta', 'Ride', now() - interval '2 days',  30000,  3300,  80)
ON CONFLICT (id) DO NOTHING;

-- Splits: tipo '<km>km', dato = segundos (como los guarda calcularSplits).
INSERT INTO logros (salida_id, tipo, dato) VALUES
 (999000001, '5km',  '520'),
 (999000001, '10km', '1080'),
 (999000001, '20km', '2250'),
 (999000002, '40km', '4700'),
 (999000002, '80km', '9600');

-- ---------- LIMPIEZA ----------
-- DELETE FROM logros  WHERE salida_id IN (999000001, 999000002, 999000003);
-- DELETE FROM salidas WHERE athlete_id = 999001;
-- DELETE FROM atletas WHERE id = 999001;
