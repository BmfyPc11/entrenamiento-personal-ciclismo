'use client';

/* Tarjeta del consejo del entrenador. La logica vive en lib/metrics.js. */
export default function Consejo({ consejo }) {
  if (!consejo) return null;
  return (
    <div className={`consejo ${consejo.tono}`}>
      <span className="tag" style={{ marginLeft: 0, background: 'transparent', padding: 0 }}>
        Consejo del entrenador · {consejo.etiqueta}
      </span>
      <p className="tit">{consejo.titulo}</p>
      <p>{consejo.texto}</p>
    </div>
  );
}
