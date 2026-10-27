// Piezas comunes del agente de WhatsApp: identidad, permisos, pendientes y cola.
import { normalizar, escaparLike } from '../lib/texto.js';
import { alcanceAlumnos } from '../lib/permisos.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';
import { enviar } from './envio.js';

export const NOMBRE_ROL = {
  alumno: 'alumno', padre: 'padre de familia', profesor: 'profesor', contabilidad: 'contabilidad', secretaria: 'secretaría', direccion: 'dirección',
};
export const ROLES_DEMO = {
  padre: 'padre', mama: 'padre', apoderado: 'padre', profesor: 'profesor', profesora: 'profesor', docente: 'profesor',
  contador: 'contabilidad', contadora: 'contabilidad', contabilidad: 'contabilidad', secretaria: 'secretaria',
  director: 'direccion', directora: 'direccion', direccion: 'direccion', alumno: 'alumno', alumna: 'alumno', estudiante: 'alumno',
};

// ¿Quién escribe? Personal por su celular, luego apoderados. En colegios demo, un
// celular real puede "ponerse" un rol con la palabra PADRE, PROFESOR, CONTADORA…
export async function identificar(env, colegio, telefono) {
  if (colegio.es_demo) {
    const demo = await env.DB.prepare('SELECT rol FROM wa_identidad_demo WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, telefono).first();
    if (demo) {
      const p = await personaDemo(env, colegio, demo.rol);
      if (p) return { ...p, telefono, demo: true };
    }
  }
  const u = await env.DB.prepare(
    `SELECT id, colegio_id, nombre, rol, apoderado_id FROM usuarios
      WHERE colegio_id = ? AND telefono = ? AND activo = 1 AND rol != 'padre' LIMIT 1`,
  ).bind(colegio.id, telefono).first();
  if (u) return { rol: u.rol, nombre: u.nombre.split(' ')[0], usuario: u, telefono };
  const ap = await env.DB.prepare('SELECT id, nombres, apellidos FROM apoderados WHERE colegio_id = ? AND telefono = ? LIMIT 1')
    .bind(colegio.id, telefono).first();
  if (ap) return personaPadre(colegio, ap, telefono);
  const al = await env.DB.prepare("SELECT * FROM alumnos WHERE colegio_id = ? AND telefono = ? AND estado = 'matriculado' LIMIT 1")
    .bind(colegio.id, telefono).first();
  if (al) return personaAlumno(colegio, al, telefono, await tutorAutorizado(env, al.id));
  return null;
}

const tutorAutorizado = async (env, alumnoId) => !!(await env.DB.prepare(
  "SELECT 1 FROM consentimiento_vigente WHERE alumno_id = ? AND finalidad = 'tutor_ia' AND otorgado = 1 LIMIT 1",
).bind(alumnoId).first());

const personaAlumno = (colegio, al, telefono, autorizado) => ({
  rol: 'alumno', nombre: al.nombres.split(' ')[0], alumno: al, telefono, autorizado,
  usuario: { id: null, colegio_id: colegio.id, nombre: `${al.nombres} ${al.apellidos} (alumno)`, rol: 'alumno', apoderado_id: null },
});

const personaPadre = (colegio, ap, telefono) => ({
  rol: 'padre', nombre: ap.nombres.split(' ')[0], apoderado: ap, telefono,
  usuario: { id: null, colegio_id: colegio.id, nombre: `${ap.nombres} ${ap.apellidos}`, rol: 'padre', apoderado_id: ap.id },
});

async function personaDemo(env, colegio, rol) {
  if (rol === 'alumno') {
    const al = await env.DB.prepare(
      `SELECT a.* FROM alumnos a WHERE a.colegio_id = ? AND a.nivel = 'Secundaria' AND a.estado = 'matriculado'
        AND EXISTS (SELECT 1 FROM consentimiento_vigente c WHERE c.alumno_id = a.id AND c.finalidad = 'tutor_ia' AND c.otorgado = 1)
      ORDER BY a.id LIMIT 1`,
    ).bind(colegio.id).first() || await env.DB.prepare("SELECT * FROM alumnos WHERE colegio_id = ? AND nivel = 'Secundaria' ORDER BY id LIMIT 1").bind(colegio.id).first();
    return al ? personaAlumno(colegio, al, null, true) : null;
  }
  if (rol === 'padre') {
    const ap = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.apellidos FROM usuarios u JOIN apoderados ap ON ap.id = u.apoderado_id
        WHERE u.colegio_id = ? AND u.rol = 'padre' ORDER BY u.id LIMIT 1`,
    ).bind(colegio.id).first();
    return ap ? personaPadre(colegio, ap, null) : null;
  }
  const u = await env.DB.prepare('SELECT id, colegio_id, nombre, rol, apoderado_id FROM usuarios WHERE colegio_id = ? AND rol = ? ORDER BY id LIMIT 1')
    .bind(colegio.id, rol).first();
  return u ? { rol, nombre: u.nombre.split(' ')[0], usuario: u } : null;
}

// Registro de accesos: lo que se consulta por WhatsApp también queda registrado
export function auditoria(env, colegio, persona, accion, entidad = null, entidadId = null, detalle = {}) {
  return sentenciaAuditoria(env, { colegioId: colegio.id, usuario: persona.usuario }, accion, entidad, entidadId,
    { canal: 'whatsapp', ...(persona.demo ? { demo: true } : {}), ...detalle });
}

// ---- Acciones pendientes de confirmación o de un dato ----
export async function leerPendiente(env, colegio, telefono) {
  const p = await env.DB.prepare("SELECT accion, datos FROM wa_pendientes WHERE colegio_id = ? AND telefono = ? AND expira > datetime('now')")
    .bind(colegio.id, telefono).first();
  return p ? { accion: p.accion, datos: JSON.parse(p.datos) } : null;
}
export const guardarPendiente = (env, colegio, telefono, accion, datos) => env.DB.prepare(
  `INSERT INTO wa_pendientes (colegio_id, telefono, accion, datos, expira) VALUES (?, ?, ?, ?, datetime('now', '+15 minutes'))
   ON CONFLICT(colegio_id, telefono) DO UPDATE SET accion = excluded.accion, datos = excluded.datos, expira = excluded.expira`,
).bind(colegio.id, telefono, accion, JSON.stringify(datos)).run();
export const borrarPendiente = (env, colegio, telefono) =>
  env.DB.prepare('DELETE FROM wa_pendientes WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, telefono).run();

// ---- Alumnos dentro del alcance del rol ----
const NO_NOMBRE = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'mi', 'hijo', 'hija', 'por', 'favor', 'en', 'con', 'a']);

export async function buscarAlumnos(env, colegio, persona, consulta, limite = 6) {
  const alcance = alcanceAlumnos(persona.usuario);
  const codigo = String(consulta || '').match(/\b([A-Za-z]{2}\d{4})\b/)?.[1];
  if (codigo) {
    const { results } = await env.DB.prepare(
      `SELECT a.* FROM alumnos a WHERE a.colegio_id = ? AND a.codigo = ? AND ${alcance.sql}`,
    ).bind(colegio.id, codigo.toUpperCase(), ...alcance.params).all();
    return results;
  }
  const todas = normalizar(consulta).split(' ').filter((p) => p.length > 1 && !NO_NOMBRE.has(p));
  // En frases como "cómo le va en clases a Adrián Mendoza", los nombres van con mayúscula
  const conMayuscula = normalizar(String(consulta).split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).join(' ')).split(' ').filter((p) => p.length > 1);
  const intentos = [todas.slice(0, 4), conMayuscula.slice(0, 4), todas.slice(-2)].filter((x) => x.length);
  for (const palabras of intentos) {
    const r = await consultarNombre(env, colegio, alcance, palabras, limite);
    if (r.length) return r;
  }
  return [];
}

async function consultarNombre(env, colegio, alcance, palabras, limite) {
  const { results } = await env.DB.prepare(
    `SELECT a.* FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${alcance.sql}
       AND ${palabras.map(() => "a.nombre_busqueda LIKE ? ESCAPE '\\'").join(' AND ')}
     ORDER BY a.nombre_busqueda LIMIT ?`,
  ).bind(colegio.id, ...alcance.params, ...palabras.map((p) => `%${escaparLike(p)}%`), limite).all();
  return results;
}

export const listaOpciones = (alumnos) =>
  alumnos.map((a, i) => `${i + 1}) ${a.nombres} ${a.apellidos} — ${a.grado} ${a.seccion} (${a.codigo})`).join('\n');

// ---- Cola de envíos masivos ----
// El "lote" agrupa un envío (un comunicado) para medir entregados y leídos
export async function encolar(env, colegio, destinatarios, texto, motivo, creadoPor, lote = `${motivo}-${Date.now()}`) {
  if (!destinatarios.length) return 0;
  const lotes = [];
  for (const d of destinatarios) {
    lotes.push(env.DB.prepare('INSERT INTO wa_cola (colegio_id, telefono, apoderado_id, nombre, texto, motivo, creado_por, lote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(colegio.id, d.telefono, d.apoderado_id ?? null, (d.nombres || '').split(' ')[0], texto, motivo, creadoPor ?? null, lote));
  }
  await env.DB.batch(lotes);
  return destinatarios.length;
}

// Envía hasta `presupuesto` mensajes de la cola. Lo llaman el agente (primera tanda) y el cron.
export async function procesarCola(env, presupuesto, cargarConexion) {
  const { results } = await env.DB.prepare('SELECT * FROM wa_cola WHERE enviado_en IS NULL ORDER BY id LIMIT ?').bind(presupuesto).all();
  const conexiones = new Map();
  for (const m of results) {
    if (!conexiones.has(m.colegio_id)) {
      const c = await env.DB.prepare('SELECT * FROM colegios WHERE id = ?').bind(m.colegio_id).first();
      conexiones.set(m.colegio_id, await cargarConexion(env, c));
    }
    const conexion = conexiones.get(m.colegio_id);
    // Fuera de la ventana de 24 h WhatsApp exige plantilla: {{1}} nombre, {{2}} mensaje
    const r = await enviar(env, conexion, {
      telefono: m.telefono, apoderadoId: m.apoderado_id, texto: `Hola ${m.nombre || ''}, ${m.texto}`, motivo: m.motivo, enviadoPor: m.creado_por,
      plantilla: conexion.colegio.wa_plantilla_aviso ? { nombre: conexion.colegio.wa_plantilla_aviso, parametros: [m.nombre || 'familia', m.texto.slice(0, 900)] } : null,
    });
    await env.DB.prepare("UPDATE wa_cola SET enviado_en = datetime('now'), mensaje_id = ? WHERE id = ?").bind(r.id, m.id).run();
  }
  return results.length;
}

// Apoderados con autorización de WhatsApp de un conjunto de alumnos
export async function apoderadosConPermiso(env, colegio, filtroSql, params) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT ap.id AS apoderado_id, ap.nombres, ap.telefono FROM alumnos a
       JOIN alumno_apoderado aa ON aa.alumno_id = a.id JOIN apoderados ap ON ap.id = aa.apoderado_id
      WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ap.telefono IS NOT NULL AND ${filtroSql}
        AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = a.id
              AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1`,
  ).bind(colegio.id, ...params).all();
  return results;
}
