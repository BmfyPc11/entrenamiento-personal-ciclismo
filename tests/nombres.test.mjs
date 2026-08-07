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
