'use client';

import { useEffect, useRef } from 'react';
import {
  IcoResumen, IcoDatos, IcoEntrenamientos, IcoAscensiones,
  IcoCarga, IcoObjetivos, IcoRutas, IcoGPX, IcoLogros, IcoMenu, IcoCerrar,
} from './Iconos';

export const SECCIONES = [
  ['resumen', 'Resumen', IcoResumen],
  ['datos', 'Tus datos', IcoDatos],
  ['entrenamientos', 'Entrenamientos', IcoEntrenamientos],
  ['ascensiones', 'Mis ascensiones', IcoAscensiones],
  ['carga', 'Carga y forma', IcoCarga],
  ['objetivos', 'Objetivos', IcoObjetivos],
  ['rutas', 'Rutas', IcoRutas],
  ['analizador', 'Analizar GPX', IcoGPX],
  ['logros', 'Logros', IcoLogros],
];

/*
  Carcasa de la aplicacion: barra lateral fija en escritorio y cajon en
  movil. El contenido de cada seccion se pasa como children; aqui no se
  sabe nada de lo que hay dentro.
*/
export default function Layout({
  seccion, setSeccion, atleta, onActualizar, refrescando, abierto, setAbierto, children,
}) {
  const botonMenu = useRef(null);

  /* Escape cierra el cajon, y el foco vuelve al boton que lo abrio: si se
     quedara suelto, el teclado seguiria navegando por detras del velo. */
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e) => {
      if (e.key === 'Escape') { setAbierto(false); botonMenu.current?.focus(); }
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, setAbierto]);

  /* Con el cajon abierto el fondo no debe poder desplazarse. */
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [abierto]);

  const ir = (id) => { setSeccion(id); setAbierto(false); };

  return (
    <div className="app">
      <aside className={`lateral${abierto ? ' abierto' : ''}`}>
        <div className="marca">
          <div className="nom">Cuaderno<br />de <em>ruta</em></div>
          <div className="sub">Análisis de ciclismo</div>
        </div>

        <nav className="secciones" aria-label="Secciones">
          {SECCIONES.map(([id, txt, Ico]) => (
            <button key={id} onClick={() => ir(id)}
              aria-current={seccion === id ? 'page' : undefined}>
              <Ico /> {txt}
            </button>
          ))}
        </nav>

        <div className="pie-lateral">
          <div className="usuario">
            {atleta?.foto
              ? <img src={atleta.foto} alt="" />
              : <div className="ini">{(atleta?.nombre || '?').charAt(0)}</div>}
            <div>
              <b>{atleta?.nombre || 'Conectado'}</b>
              <span>vía Strava</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onActualizar} disabled={refrescando} style={{ flex: 1 }}>
              {refrescando ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button onClick={() =>
              fetch('/api/auth/logout', { method: 'POST' })
                .then(() => window.location.reload())}>
              Salir
            </button>
          </div>
        </div>
      </aside>

      <div className={`velo${abierto ? ' visible' : ''}`}
        onClick={() => setAbierto(false)} aria-hidden="true" />

      <div className="principal">
        <div className="barra-movil">
          <button ref={botonMenu} onClick={() => setAbierto(true)}
            aria-label="Abrir el menú" aria-expanded={abierto}
            style={{ padding: '6px 8px', lineHeight: 0 }}>
            {abierto ? <IcoCerrar /> : <IcoMenu />}
          </button>
          <div className="nom">Cuaderno de <em>ruta</em></div>
        </div>

        {children}
      </div>
    </div>
  );
}
