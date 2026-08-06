'use client';

import { useMemo, useState } from 'react';
import { CATALOGO, evaluarRuta, rutasPropias } from '@/lib/rutas';
import { referenciasCiclista } from '@/lib/gpx';
import { num } from '@/lib/metrics';

const COLOR_ESTADO = {
  'a tu alcance': 'var(--z2)',
  'siguiente paso': 'var(--z3)',
  'exigente': 'var(--z4)',
  'todavía no': 'var(--z5)',
  'sin datos': 'var(--ink3)',
};

export default function Rutas({ salidas, cache, excluidas, cfg }) {
  const [kmMin, setKmMin] = useState(0);
  const [kmMax, setKmMax] = useState(120);
  const [dMin, setDMin] = useState(0);
  const [dMax, setDMax] = useState(1500);
  const [tipo, setTipo] = useState('todos');
  const [soloAlcance, setSoloAlcance] = useState(false);
  const [incluirPropias, setIncluirPropias] = useState(true);

  const ref = useMemo(
    () => referenciasCiclista(salidas, cache, excluidas),
    [salidas, cache, excluidas]
  );

  const todas = useMemo(() => {
    const base = [...CATALOGO];
    if (incluirPropias) base.push(...rutasPropias(salidas, excluidas));
    return base
      .map((r) => ({ ...r, ev: evaluarRuta(r, ref) }))
      .sort((a, b) => a.ev.orden - b.ev.orden || a.desnivel - b.desnivel);
  }, [ref, salidas, excluidas, incluirPropias]);

  const filtradas = todas.filter((r) =>
    r.km >= kmMin && r.km <= kmMax &&
    r.desnivel >= dMin && r.desnivel <= dMax &&
    (tipo === 'todos' || r.tipo === tipo) &&
    (!soloAlcance || r.ev.orden <= 1)
  );

  return (
    <>
      <h2>Rutas para tu zona</h2>
      <p className="hint">
        Cada ruta se compara con tu mejor registro para decirte si está a tu alcance hoy. El
        criterio es el mismo que en el analizador: manda la exigencia peor parada, no el promedio.
      </p>

      <div className="panel">
        <h3 style={{ marginBottom: 14 }}>Filtros</h3>
        <div className="fields">
          <div>
            <label htmlFor="r1">Distancia mínima (km)</label>
            <input id="r1" type="number" min="0" max="300" step="5" value={kmMin}
              onChange={(e) => setKmMin(+e.target.value || 0)} />
          </div>
          <div>
            <label htmlFor="r2">Distancia máxima (km)</label>
            <input id="r2" type="number" min="0" max="300" step="5" value={kmMax}
              onChange={(e) => setKmMax(+e.target.value || 300)} />
          </div>
          <div>
            <label htmlFor="r3">Desnivel mínimo (m)</label>
            <input id="r3" type="number" min="0" max="4000" step="50" value={dMin}
              onChange={(e) => setDMin(+e.target.value || 0)} />
          </div>
          <div>
            <label htmlFor="r4">Desnivel máximo (m)</label>
            <input id="r4" type="number" min="0" max="4000" step="50" value={dMax}
              onChange={(e) => setDMax(+e.target.value || 4000)} />
          </div>
          <div>
            <label htmlFor="r5">Tipo de terreno</label>
            <select id="r5" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="carretera">Carretera</option>
              <option value="gravel">Gravel</option>
              <option value="mixto">Mixto</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5,
            color: 'var(--ink2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={soloAlcance}
              onChange={(e) => setSoloAlcance(e.target.checked)} />
            Solo las que están a mi alcance
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5,
            color: 'var(--ink2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={incluirPropias}
              onChange={(e) => setIncluirPropias(e.target.checked)} />
            Incluir rutas que ya he hecho
          </label>
        </div>

        <div className="chips" style={{ marginTop: 16 }}>
          <button onClick={() => { setKmMin(0); setKmMax(50); setDMin(0); setDMax(400); }}>
            Salida corta
          </button>
          <button onClick={() => { setKmMin(40); setKmMax(60); setDMin(250); setDMax(700); }}>
            Media jornada
          </button>
          <button onClick={() => { setKmMin(55); setKmMax(120); setDMin(600); setDMax(1500); }}>
            Salida larga
          </button>
          <button onClick={() => { setKmMin(0); setKmMax(120); setDMin(0); setDMax(1500);
            setTipo('todos'); setSoloAlcance(false); }}>
            Quitar filtros
          </button>
        </div>

        <p className="hint" style={{ margin: '14px 0 0' }}>
          {filtradas.length} de {todas.length} rutas cumplen los filtros.
        </p>
      </div>

      {filtradas.length === 0 ? (
        <div className="callout">
          Ninguna ruta encaja con esos filtros. Prueba a ampliar los rangos.
        </div>
      ) : (
        filtradas.map((r) => (
          <div className="panel" key={r.id} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{r.nombre}</h3>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5,
                textTransform: 'uppercase', letterSpacing: '.06em',
                color: COLOR_ESTADO[r.ev.estado] }}>
                {r.ev.estado}
                {r.ev.rel ? ` · ×${num(r.ev.rel, 2)}` : ''}
              </span>
            </div>

            <p style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)',
              margin: '8px 0 12px' }}>
              {r.zona} · {num(r.km, 1)} km · +{num(r.desnivel, 0)} m ·{' '}
              {num(r.desnivel / r.km, 1)} m/km · {r.tipo}
              {r.puerto && ` · ${r.puerto.nombre}: ${num(r.puerto.km, 1)} km al ${num(r.puerto.pct, 1)} %`}
              {r.puerto?.max && ` (máx ${r.puerto.max} %)`}
            </p>

            <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 14.5, lineHeight: 1.65 }}>
              {r.nota}
            </p>
          </div>
        ))
      )}

      <div className="callout">
        <strong>De dónde salen estos datos.</strong> Las diez rutas del catálogo son las que
        planificaste y analizamos juntos: los kilómetros y el desnivel vienen de tus propios
        trazados. Las marcadas como «ya la has hecho» se generan de tu historial de Strava. No hay
        ninguna ruta inventada ni traída de una base de datos externa sin verificar.
      </div>
    </>
  );
}
