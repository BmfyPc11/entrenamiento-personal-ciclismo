'use client';

import { vatios, num } from '@/lib/metrics';
import { calcularObjetivos, BarrasObjetivo, OBJETIVOS_INICIALES } from './objetivosLib';

export default function Objetivos({ salidas, cfg, cache, excluidas, masaTotal, objetivos, setObjetivos }) {
  const r = calcularObjetivos({ salidas, cache, excluidas, cfg, masaTotal, obj: objetivos });
  const o = r.o;
  const set = (k, v) => setObjetivos({ ...o, [k]: v });

  const wCarretera = vatios(o.llano / 3.6, 0, masaTotal, 0.3, 0.005);

  return (
    <>
      <h2>Tus objetivos</h2>
      <p className="hint">
        Medidos contra tu mejor registro real, no contra una media: un objetivo se alcanza el día
        que lo consigues una vez. Cuantas más salidas abras en Entrenamientos, más afinada será la
        medición de los dos objetivos de subida.
      </p>

      <BarrasObjetivo lista={r.lista} />

      <h2>Ajusta lo que persigues</h2>
      <p className="hint">
        Los valores por defecto son los que veníamos usando. Cámbialos si quieres apuntar más alto
        o partir de una meta más cercana; el progreso se recalcula al momento.
      </p>

      <div className="panel">
        <h3 style={{ marginBottom: 14 }}>Velocidad en llano</h3>
        <div className="fields">
          <div>
            <label htmlFor="o1">Objetivo de crucero (km/h)</label>
            <input id="o1" type="number" min="15" max="50" step="0.5" value={o.llano}
              onChange={(e) => set('llano', +e.target.value || 30)} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 14 }}>Puerto largo</h3>
        <div className="fields">
          <div>
            <label htmlFor="o2">Longitud (km)</label>
            <input id="o2" type="number" min="1" max="30" step="0.5" value={o.puertoKm}
              onChange={(e) => set('puertoKm', +e.target.value || 5)} />
          </div>
          <div>
            <label htmlFor="o3">Pendiente mínima (%)</label>
            <input id="o3" type="number" min="2" max="15" step="0.5" value={o.puertoPend}
              onChange={(e) => set('puertoPend', +e.target.value || 6)} />
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 14 }}>Rampa corta</h3>
        <div className="fields">
          <div>
            <label htmlFor="o4">Longitud (km)</label>
            <input id="o4" type="number" min="0.5" max="15" step="0.5" value={o.rampaKm}
              onChange={(e) => set('rampaKm', +e.target.value || 2)} />
          </div>
          <div>
            <label htmlFor="o5">Pendiente mínima (%)</label>
            <input id="o5" type="number" min="4" max="20" step="0.5" value={o.rampaPend}
              onChange={(e) => set('rampaPend', +e.target.value || 8)} />
          </div>
        </div>
        <p className="hint" style={{ margin: '14px 0 0' }}>
          Esta pendiente marca también la frontera con el puerto largo: los ascensos por encima de
          ella cuentan aquí y no allí.
        </p>
      </div>

      <button style={{ marginTop: 16 }} onClick={() => setObjetivos({ ...OBJETIVOS_INICIALES })}>
        Restaurar los valores por defecto
      </button>

      <div className="callout warn">
        <strong>El objetivo del llano es mucho más ambicioso que los dos de subida.</strong>{' '}
        Mantener {num(o.llano, 0)} km/h con tu configuración actual pide unos {num(r.wObjetivo, 0)} W
        sostenidos; con una bici de carretera en posición baja, los mismos {num(o.llano, 0)} km/h
        bajan a {num(wCarretera, 0)} W. Son {num(r.wObjetivo - wCarretera, 0)} W de diferencia sin
        ganar un solo vatio de forma. En llano la aerodinámica pesa más que el motor.
      </div>
    </>
  );
}
