/* ============================================================
   Persistencia del catálogo de segmentos manuales.

   En Postgres, compartido entre dispositivos -al contrario que el
   marcado en curso (ver ajustesPuertosCache.js), un segmento manual
   tiene que reconocerse en cualquier salida futura, pase por donde
   pase el navegador o el dispositivo desde el que se creó. Calcado a
   nombresCache.js: ese módulo decide, este habla con la red.
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

export async function guardarSegmentosManuales(definiciones) {
  try {
    await fetch('/api/segmentos-manuales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definiciones }),
    });
  } catch {
    /* Sin red el cambio no se guarda, pero el catalogo sigue valiendo
       en memoria durante la sesion. No es motivo para romper la pestana. */
  }
}
