'use client';

import { useEffect, useMemo, useState } from 'react';
import { DISTANCIAS_SPLIT_KM, num } from '@/lib/metrics';

/* Resalta la celda del mejor de cada fila -mismo amarillo que usa el
   Analizador de GPX para la relacion mas comprometida. */
const MEJOR = { background: '#E0C020', color: '#0E1116', fontWeight: 600 };

function tiempo(segundos) {
  if (segundos == null) return '—';
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
    : `${m}:${String(seg).padStart(2, '0')}`;
}

const VENTANAS = [
  ['dias30', 'Últimos 30 días'],
  ['meses12', 'Últimos 12 meses'],
  ['historico', 'Histórico'],
];

const METRICAS_VOLUMEN = [
  ['salidas', 'Salidas', (v) => num(v, 0), 'max'],
  ['km', 'Kilómetros', (v) => num(v, 0), 'max'],
  ['desnivel', 'Desnivel (m)', (v) => num(v, 0), 'max'],
  ['horas', 'Horas', (v) => num(v, 1), 'max'],
];

export default function Amigos() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [ventana, setVentana] = useState('meses12');

  useEffect(() => {
    let vivo = true;
    fetch('/api/amigos/comparar', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (vivo) setDatos(j); })
      .catch((e) => { if (vivo) setError(e.message || 'No se ha podido cargar la comparación.'); });
    return () => { vivo = false; };
  }, []);

  const porId = useMemo(() => {
    const m = new Map();
    (datos?.comparacion || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [datos]);

  if (error) return <div className="callout warn">{error}</div>;
  if (!datos) return <p className="hint">Cargando la comparación…</p>;

  const { atletas } = datos;

  if (atletas.length < 2) {
    return (
      <div className="callout">
        Cuando otro ciclista conecte su Strava en este panel, aquí podrás comparar vuestro
        volumen de entrenamiento, las marcas de split y los tiempos en los puertos que
        tengáis marcados.
      </div>
    );
  }

  /* Segmentos marcados donde al menos un atleta tiene un tiempo. */
  const segmentos = (datos.segmentos || [])
    .filter((seg) => atletas.some((a) => porId.get(a.id)?.puertos?.[seg.id]?.mejorSegundos != null))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  const etiquetaSegmento = (seg) =>
    seg.nombreVertiente ? `${seg.nombre} · ${seg.nombreVertiente}` : (seg.nombre || 'Segmento');

  const nombre = (a) => (a.yo ? `${a.nombre || 'Tú'} (tú)` : a.nombre || 'Ciclista');

  /* id del atleta con el mejor valor de una fila; null si nadie tiene dato. */
  const lider = (valores, sentido) => {
    let mejorId = null, mejorVal = null;
    for (const { id, valor } of valores) {
      if (valor == null) continue;
      if (mejorVal == null
        || (sentido === 'max' ? valor > mejorVal : valor < mejorVal)) {
        mejorVal = valor; mejorId = id;
      }
    }
    return mejorId;
  };

  return (
    <>
      <div className="callout">
        Comparación abierta entre todos los ciclistas que han conectado su Strava en este
        panel. Al conectarte, tus marcas y tu volumen son visibles para el resto.
      </div>

      {/* ---------- volumen ---------- */}
      <h2>Volumen</h2>
      <div className="chips" style={{ marginBottom: 12 }}>
        {VENTANAS.map(([id, txt]) => (
          <button key={id} aria-pressed={ventana === id} onClick={() => setVentana(id)}
            style={ventana === id ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
            {txt}
          </button>
        ))}
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              {atletas.map((a) => <th key={a.id}>{nombre(a)}</th>)}
            </tr>
          </thead>
          <tbody>
            {METRICAS_VOLUMEN.map(([clave, etiqueta, fmt, sentido]) => {
              const valores = atletas.map((a) => ({
                id: a.id,
                valor: porId.get(a.id)?.volumen?.[ventana]?.[clave] ?? null,
              }));
              const top = lider(valores, sentido);
              return (
                <tr key={clave}>
                  <td>{etiqueta}</td>
                  {valores.map(({ id, valor }) => (
                    <td key={id} style={id === top ? MEJOR : null}>
                      {valor == null ? '—' : fmt(valor)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- puertos ---------- */}
      <h2>Puertos marcados</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Mejor tiempo de cada uno en los segmentos marcados a mano, con su mejor VAM y las
        veces que lo ha subido. Menos tiempo es mejor.
      </p>
      {segmentos.length === 0 ? (
        <div className="callout">
          Todavía no hay tiempos. Se calculan al sincronizar (cada salida se cruza con los
          segmentos marcados); si acabas de crear un segmento, sincroniza para que aparezca.
        </div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Puerto</th>
                {atletas.map((a) => <th key={a.id}>{nombre(a)}</th>)}
              </tr>
            </thead>
            <tbody>
              {segmentos.map((seg) => {
                const valores = atletas.map((a) => ({
                  id: a.id,
                  p: porId.get(a.id)?.puertos?.[seg.id] || null,
                }));
                const top = lider(
                  valores.map(({ id, p }) => ({ id, valor: p?.mejorSegundos ?? null })), 'min');
                return (
                  <tr key={seg.id}>
                    <td>{etiquetaSegmento(seg)}</td>
                    {valores.map(({ id, p }) => (
                      <td key={id} style={id === top ? MEJOR : null}>
                        {p?.mejorSegundos == null ? '—' : (
                          <>
                            {tiempo(p.mejorSegundos)}
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--ink3)' }}>
                              {p.mejorVam ? `VAM ${num(p.mejorVam, 0)}` : 'sin VAM'} · ×{p.veces}
                            </span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- splits ---------- */}
      <h2>Marcas de split</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        El tiempo más rápido de cada uno en cubrir esa distancia, contando solo salidas
        llanas. Menos es mejor.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Distancia</th>
              {atletas.map((a) => <th key={a.id}>{nombre(a)}</th>)}
            </tr>
          </thead>
          <tbody>
            {DISTANCIAS_SPLIT_KM.map((d) => {
              const valores = atletas.map((a) => ({
                id: a.id,
                valor: porId.get(a.id)?.splits?.[d]?.segundos ?? null,
              }));
              const top = lider(valores, 'min');
              return (
                <tr key={d}>
                  <td>{d} km</td>
                  {valores.map(({ id, valor }) => (
                    <td key={id} style={id === top ? MEJOR : null}>{tiempo(valor)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
