/* ============================================================
   Persistencia del catálogo de segmentos manuales.

   En Postgres, compartido entre dispositivos: un segmento manual tiene
   que reconocerse en cualquier salida futura, pase por donde pase el
   navegador o el dispositivo desde el que se creó. Este módulo solo
   habla con la red; la lógica de decisión vive en lib/metrics.js.
   ============================================================ */

import { useEffect, useState } from 'react';

/*
  Carga el catálogo al montar el componente y devuelve [definiciones,
  setDefiniciones], igual que un useState normal.
*/
export function useSegmentosManuales() {
  const [definiciones, setDefiniciones] = useState([]);

  useEffect(() => {
    let activo = true;
    fetch('/api/segmentos-manuales', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { definiciones: [] }))
      .then((j) => {
        if (activo) setDefiniciones(Array.isArray(j.definiciones) ? j.definiciones : []);
      })
      .catch(() => {
        /* Sin red se queda vacio; lo que se cree en esta sesion sigue
           funcionando en memoria aunque no persista. */
      });
    return () => { activo = false; };
  }, []);

  return [definiciones, setDefiniciones];
}

/*
  Una peticion por segmento -crear, cambiar, borrar-, nunca "manda el
  catalogo entero": este catalogo lo comparten dos ciclistas a la vez (sin
  athlete_id, ver schema.sql), cada uno con su propia copia en memoria
  cargada en un momento distinto. Reenviar la lista completa de quien
  llama pisaria en la base de datos cualquier fila creada por el otro
  despues de que esta copia se cargara -exactamente el bug que hacia
  desaparecer segmentos del companero sin que nadie los borrara. Tocando
  solo la fila que de verdad cambia, una copia local desactualizada del
  resto no puede pisar nada.
*/
/* fetch() no lanza si el servidor responde con un error (solo si la red
   falla del todo) -sin comprobar r.ok, un guardado que la base de datos
   rechaza pasa desapercibido: la pantalla actual se queda con el cambio
   en memoria, pero cualquier pestana que recargue el catalogo despues no
   lo va a ver nunca, sin ningun aviso de que algo fue mal. */
async function avisarSiFalla(promesaFetch, contexto) {
  try {
    const r = await promesaFetch;
    if (!r.ok) console.error(`segmentos-manuales: ${contexto} fallo (${r.status})`);
  } catch (e) {
    console.error(`segmentos-manuales: ${contexto} sin red`, e);
  }
}

export function crearSegmentoManual(def) {
  return avisarSiFalla(fetch('/api/segmentos-manuales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(def),
  }), `crear ${def.id}`);
}

export function actualizarSegmentoManual(id, cambios) {
  return avisarSiFalla(fetch(`/api/segmentos-manuales/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cambios),
  }), `actualizar ${id}`);
}

export function eliminarSegmentoManual(id) {
  return avisarSiFalla(fetch(`/api/segmentos-manuales/${id}`, { method: 'DELETE' }), `eliminar ${id}`);
}
