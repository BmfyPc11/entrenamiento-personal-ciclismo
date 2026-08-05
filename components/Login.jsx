const MENSAJES = {
  permiso_denegado: 'Has cancelado la conexión en Strava. Vuelve a intentarlo cuando quieras.',
  falta_permiso_actividades:
    'Falta un permiso. En la pantalla de Strava tienes que dejar marcada la casilla que permite ver tus actividades, incluidas las privadas.',
  sin_codigo: 'Strava no devolvió el código de acceso. Inténtalo otra vez.',
  fallo_conexion: 'No se pudo completar la conexión. Revisa que las claves del proyecto sean correctas.',
};

export default function Login({ error }) {
  return (
    <div className="wrap">
      <div className="login">
        <p className="eyebrow">Cuaderno de ruta</p>
        <h1>
          Tus datos,
          <br />
          <em>leídos bien</em>
        </h1>

        <p>
          Conecta tu cuenta y este panel leerá todas tus salidas en bicicleta: velocidad en llano,
          rendimiento en subida, carga de entrenamiento y el detalle puerto a puerto de cada sesión.
        </p>

        {error && (
          <div className="callout warn" style={{ textAlign: 'left' }}>
            {MENSAJES[error] || 'Algo no funcionó al conectar con Strava.'}
          </div>
        )}

        <a className="btn btn-strava" href="/api/auth/strava">
          Conectar con Strava
        </a>

        <div className="pasos">
          <strong>Qué permisos se piden y por qué</strong>
          <ol>
            <li>Ver tus actividades, incluidas las privadas: es lo que alimenta todo el análisis.</li>
            <li>Ver tu perfil: solo para mostrar tu nombre y tu peso si lo tienes puesto.</li>
          </ol>
          <p style={{ margin: '10px 0 0' }}>
            No se escribe nada en tu cuenta y no se guarda ninguna actividad en ningún servidor:
            los datos viajan de Strava a tu navegador cada vez que abres el panel. Puedes revocar
            el acceso cuando quieras desde los ajustes de tu cuenta de Strava.
          </p>
        </div>
      </div>
    </div>
  );
}
