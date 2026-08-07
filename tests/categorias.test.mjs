import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coeficientePuerto, categoriaPuerto } from '../lib/metrics.js';

/* La longitud entra en kilometros. Con metros, un puerto normal daria
   cientos de miles y todo saldria HC. */
test('el coeficiente usa la longitud en kilometros', () => {
  // 3,7 km al 7,2 % -> 3,7 * 51,84
  assert.equal(Math.round(coeficientePuerto(3700, 7.2)), 192);
});

test('sin longitud o sin pendiente el coeficiente es cero', () => {
  assert.equal(coeficientePuerto(0, 8), 0);
  assert.equal(coeficientePuerto(1000, 0), 0);
  assert.equal(coeficientePuerto(1000, -3), 0);
  assert.equal(coeficientePuerto(null, null), 0);
});

test('la pendiente pesa al cuadrado', () => {
  // doblar la pendiente multiplica por cuatro; doblar la longitud, por dos
  const base = coeficientePuerto(1000, 5);
  assert.equal(coeficientePuerto(1000, 10), base * 4);
  assert.equal(coeficientePuerto(2000, 5), base * 2);
});

test('los puertos duros conocidos salen HC', () => {
  assert.equal(categoriaPuerto(12500, 10.1).codigo, 'hc');   // Angliru, 1275
  assert.equal(categoriaPuerto(12400, 10.5).codigo, 'hc');   // Mortirolo, 1367
  assert.equal(categoriaPuerto(19000, 7.4).codigo, 'hc');    // Tourmalet, 1040
  assert.equal(categoriaPuerto(13800, 8.1).codigo, 'hc');    // Alpe d'Huez, 905
});

test('cada tramo de la escala cae en su categoria', () => {
  assert.equal(categoriaPuerto(1000, 5).nombre, '4ª cat');     // 25
  assert.equal(categoriaPuerto(4000, 5).nombre, '3ª cat');     // 100
  assert.equal(categoriaPuerto(12000, 5).nombre, '2ª cat');    // 300
  assert.equal(categoriaPuerto(24000, 5).nombre, '1ª cat');    // 600
  assert.equal(categoriaPuerto(12400, 10.5).nombre, 'HC');     // 1367
});

test('los limites exactos caen en la categoria baja', () => {
  // 75 es el tope de 4a: 3 km al 5 % da exactamente 75
  assert.equal(categoriaPuerto(3000, 5).coef, 75);
  assert.equal(categoriaPuerto(3000, 5).codigo, '4a');
  // 200 es el tope de 3a: 8 km al 5 %
  assert.equal(categoriaPuerto(8000, 5).coef, 200);
  assert.equal(categoriaPuerto(8000, 5).codigo, '3a');
});

/*
  El motivo de bajar los umbrales: con la escala de las grandes vueltas
  estas cuatro subidas de una misma salida por Montjuic salian las
  cuatro como 4a, y una etiqueta que siempre dice lo mismo no informa.
*/
test('una salida real reparte sus subidas en varias categorias', () => {
  assert.equal(categoriaPuerto(730, 4.3).codigo, '4a');    // 13
  assert.equal(categoriaPuerto(600, 6.5).codigo, '4a');    // 25
  assert.equal(categoriaPuerto(1830, 8.4).codigo, '3a');   // 129
  assert.equal(categoriaPuerto(3700, 7.2).codigo, '3a');   // 192
});

test('un puerto plano no revienta', () => {
  const c = categoriaPuerto(5000, 0);
  assert.equal(c.coef, 0);
  assert.equal(c.codigo, '4a');
});

test('la categoria trae color y coeficiente', () => {
  const c = categoriaPuerto(3700, 7.2);
  assert.ok(c.color.startsWith('#'));
  assert.equal(Math.round(c.coef), 192);
});
