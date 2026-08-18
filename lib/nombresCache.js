/* ============================================================
   Persistencia de la cache de nombres de subidas.

   Antes vivia en localStorage (por navegador); ahora en Postgres,
   compartida entre dispositivos. Separado de nombres.js a proposito:
   ese modulo decide, este habla con la red.
   ============================================================ */

import { useEffect, useState } from 'react';

/*
  Carga la cache al montar el componente y devuelve [entradas, setEntradas],
  igual que un useState normal, para poder sustituir sin mas cambios el
  viejo useState(() => leerCache()).
*/
export function useCacheNombres() {
  const [entradas, setEntradas] = useState([]);

  useEffect(() => {
    let activo = true;
    fetch('/api/nombres/cache', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { entradas: [] }))
      .then((j) => {
        if (activo) setEntradas(Array.isArray(j.entradas) ? j.entradas : []);
      })
      .catch(() => {
        /* Sin red se queda vacia; los nombres que se resuelvan en esta
           sesion siguen funcionando en memoria aunque no persistan. */
      });
    return () => { activo = false; };
  }, []);

  return [entradas, setEntradas];
}

export async function escribirCache(entradas) {
  try {
    await fetch('/api/nombres/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entradas }),
    });
  } catch {
    /* Sin red el cambio no se guarda, pero los nombres siguen valiendo
       en memoria durante la sesion. No es motivo para romper la pestana. */
  }
}
