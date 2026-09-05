/* ============================================================
   Persistencia (en localStorage, por navegador) de los ajustes hechos a
   mano sobre puertos detectados automaticamente -ver ajustesAuto en
   Entrenamientos, y el clic derecho para mover/borrar un puerto en
   Perfil (prop `marcado`).

   Los segmentos marcados desde cero (no ajustes sobre uno detectado) no
   viven aqui: esos se guardan por sus coordenadas en el catalogo
   compartido de segmentosManualesCache.js, para poder reconocerse en
   cualquier salida futura. Un ajuste sobre un detectado no tiene ese
   problema -detectarPuertos lo vuelve a encontrar el solo en cada
   salida donde aparezca- asi que le basta con quedarse en el navegador,
   indexado por la salida en la que se ha tocado: es un marcado que
   todavia se esta afinando salida a salida, y no hace falta la
   complejidad de sincronizarlo con un servidor para que sobreviva a
   cambiar de pestana o recargar la pagina, que es todo lo que se pedia.
   ============================================================ */

const CLAVE = 'ajustesPuertos.v1';

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
export function leerAjustesPuertos(salidaId) {
  if (!salidaId) return {};
  return leerTodo()[salidaId] || {};
}

/* Si queda vacio (el usuario ha deshecho todos sus ajustes en esta
   salida) se borra la entrada entera en vez de guardar un objeto vacio:
   si no, el almacen crece para siempre con una entrada por cada salida
   que se ha llegado a abrir, aunque no se haya tocado nada. */
export function guardarAjustesPuertos(salidaId, ajustesAuto) {
  if (!salidaId) return;
  const todo = leerTodo();
  const vacio = !(ajustesAuto && Object.keys(ajustesAuto).length);

  if (vacio) {
    if (!(salidaId in todo)) return;
    delete todo[salidaId];
  } else {
    todo[salidaId] = ajustesAuto;
  }
  escribirTodo(todo);
}
