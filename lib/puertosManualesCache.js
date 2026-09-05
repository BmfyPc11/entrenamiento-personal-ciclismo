/* ============================================================
   Persistencia (en localStorage, por navegador) de los puertos marcados
   o editados a mano en el perfil de una salida -ver prop `marcado` de
   Perfil y el estado tramosManuales/ajustesAuto de Entrenamientos.

   A diferencia de nombresCache.js (que ya vive en Postgres, compartido
   entre dispositivos) esto se queda en el navegador: es un marcado que
   todavia se esta afinando salida a salida, y no hace falta la
   complejidad de sincronizarlo con un servidor para que sobreviva a
   cambiar de pestana o recargar la pagina, que es todo lo que se pedia.
   ============================================================ */

const CLAVE = 'puertosManuales.v1';

function leerTodo() {
  if (typeof window === 'undefined') return {};
  try {
    const j = JSON.parse(window.localStorage.getItem(CLAVE) || '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function escribirTodo(porSalida) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(porSalida));
  } catch {
    /* localStorage lleno o bloqueado (navegacion privada): el marcado
       sigue funcionando en memoria durante la sesion, solo no persiste. */
  }
}

/* Lo guardado para una salida, o vacio si no hay nada -asi Entrenamientos
   no tiene que comprobar null en cada sitio donde lo usa. */
export function leerPuertosManuales(salidaId) {
  if (!salidaId) return { tramosManuales: [], ajustesAuto: {} };
  const entrada = leerTodo()[salidaId];
  return {
    tramosManuales: entrada?.tramosManuales || [],
    ajustesAuto: entrada?.ajustesAuto || {},
  };
}

/* Si ambos quedan vacios (el usuario ha deshecho todos sus cambios en
   esta salida) se borra la entrada entera en vez de guardar un objeto
   vacio: si no, el almacen crece para siempre con una entrada por cada
   salida que se ha llegado a abrir, aunque no se haya tocado nada. */
export function guardarPuertosManuales(salidaId, { tramosManuales, ajustesAuto }) {
  if (!salidaId) return;
  const todo = leerTodo();
  const vacio = !(tramosManuales?.length) && !(ajustesAuto && Object.keys(ajustesAuto).length);

  if (vacio) {
    if (!(salidaId in todo)) return;
    delete todo[salidaId];
  } else {
    todo[salidaId] = { tramosManuales, ajustesAuto };
  }
  escribirTodo(todo);
}
