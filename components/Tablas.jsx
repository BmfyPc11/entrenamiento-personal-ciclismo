'use client';

/*
  Piezas comunes de las tablas ordenables: la cabecera que ordena, su
  flecha y el comparador. Viven aparte porque las usan dos pantallas
  -"Tus salidas" en Resumen y "Mis ascensiones"- y el criterio de cada
  columna es lo unico que cambia entre ellas.
*/

/*
  El triangulo solo se dibuja en la columna que manda; en las demas
  ocupa su sitio pero no se ve, para que al cambiar de columna los
  rotulos no bailen de posicion.
*/
export function Flecha({ activo, desc }) {
  return (
    <span className="th-orden-flecha" aria-hidden="true"
      style={activo ? undefined : { visibility: 'hidden' }}>
      {desc ? '▾' : '▴'}
    </span>
  );
}

/* Cabecera clicable: primer clic ordena de mayor a menor (que es lo que
   se suele buscar -la subida mas larga, la mas rapida-), el segundo da
   la vuelta. */
export function ThOrden({ campo, orden, setOrden, className, children }) {
  const activo = orden.campo === campo;
  const alPulsar = () => setOrden(
    activo ? { campo, desc: !orden.desc } : { campo, desc: true }
  );
  return (
    <th className={className} aria-sort={activo ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={`th-orden${activo ? ' activo' : ''}`} onClick={alPulsar}>
        {children}
        <Flecha activo={activo} desc={orden.desc} />
      </button>
    </th>
  );
}

/*
  Las filas sin el dato (FC sin pulsometro, una subida sin tiempo) van
  siempre al final, se ordene como se ordene: mandarlas arriba al
  invertir el sentido solo llenaria la primera pantalla de guiones.
*/
export function ordenarPor(lista, criterios, campo, desc) {
  const valor = criterios[campo];
  if (!valor) return [...lista];
  return [...lista].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const faltaA = va == null || va === '';
    const faltaB = vb == null || vb === '';
    if (faltaA && faltaB) return 0;
    if (faltaA) return 1;
    if (faltaB) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb;
    return desc ? -cmp : cmp;
  });
}
