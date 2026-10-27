// Matriz de accesos por rol (Ley 29733: solo accede quien lo necesita para su función).
// El navegador recibe esta lista solo para mostrar u ocultar menús: el Worker la vuelve
// a comprobar en cada solicitud.
export const ROLES = {
  direccion: 'Dirección',
  contabilidad: 'Contabilidad',
  secretaria: 'Secretaría',
  profesor: 'Profesor',
  padre: 'Padre o apoderado',
};

const TODO_FICHA = ['ficha.personal', 'ficha.apoderados', 'ficha.academico', 'ficha.pagos',
  'ficha.salud', 'ficha.mensajes', 'ficha.consentimientos', 'ficha.accesos'];

export const PERMISOS = {
  direccion: [
    'alumnos.buscar', 'alumnos.editar', ...TODO_FICHA,
    'pagos.ver', 'pagos.editar', 'recordatorios.enviar',
    'utiles.ver', 'utiles.editar', 'panel.ver', 'auditoria.ver', 'usuarios.gestionar',
    'ajustes.editar', 'whatsapp.ver', 'whatsapp.responder', 'consentimientos.ver',
    'consentimientos.registrar', 'arco.gestionar',
    'importar.alumnos', 'importar.pagos', 'importar.utiles',
  ],
  contabilidad: [
    'alumnos.buscar', 'ficha.personal', 'ficha.apoderados', 'ficha.pagos', 'ficha.consentimientos',
    'pagos.ver', 'pagos.editar', 'recordatorios.enviar', 'whatsapp.ver', 'whatsapp.responder',
    'consentimientos.ver', 'importar.pagos',
  ],
  secretaria: [
    'alumnos.buscar', 'alumnos.editar', 'ficha.personal', 'ficha.apoderados', 'ficha.academico',
    'ficha.pagos_estado', 'ficha.salud', 'ficha.mensajes', 'ficha.consentimientos',
    'utiles.ver', 'utiles.editar', 'whatsapp.ver', 'whatsapp.responder',
    'consentimientos.ver', 'consentimientos.registrar', 'arco.gestionar',
    'importar.alumnos', 'importar.utiles',
  ],
  // Profesor: solo los alumnos de sus secciones, sin pagos ni datos de contacto completos.
  profesor: ['alumnos.buscar', 'ficha.personal', 'ficha.academico', 'ficha.salud_alertas', 'utiles.ver'],
  // Padre: solo sus hijos (el alcance se aplica en alcanceAlumnos).
  padre: [
    'alumnos.buscar', 'ficha.personal', 'ficha.apoderados', 'ficha.academico', 'ficha.pagos',
    'ficha.salud', 'ficha.consentimientos', 'ficha.accesos', 'utiles.ver',
    'consentimientos.propios', 'arco.solicitar',
  ],
};

export const tiene = (usuario, permiso) => (PERMISOS[usuario.rol] || []).includes(permiso);

// Fragmento SQL que limita los alumnos visibles según el rol. Se usa con alias "a".
export function alcanceAlumnos(usuario) {
  if (usuario.rol === 'padre') {
    return {
      sql: 'a.id IN (SELECT alumno_id FROM alumno_apoderado WHERE apoderado_id = ?)',
      params: [usuario.apoderado_id ?? -1],
    };
  }
  if (usuario.rol === 'profesor') {
    return {
      sql: 'EXISTS (SELECT 1 FROM profesor_secciones ps WHERE ps.usuario_id = ? AND ps.grado = a.grado AND ps.seccion = a.seccion)',
      params: [usuario.id],
    };
  }
  return { sql: '1 = 1', params: [] };
}
