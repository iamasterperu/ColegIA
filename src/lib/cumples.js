// Cumpleaños desde los registros del colegio: Excel (nombre, DNI, fecha, celular) o foto del DNI.
// Cada fila se reconoce primero por DNI y, si no, por nombre completo (sin importar el orden). El saludo sale
// solo si la persona tiene fecha y número de WhatsApp; quien no tenga alguno de los dos queda sin saludo y se lista.
import { normalizar, normalizarTelefono } from './texto.js';
import { leerImagen } from '../ia/modelo.js';

const dniOk = (v) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 8 ? d : null; };

// Acepta 2016-05-14, 14/05/2016, 14-05-16 y 14/05 (sin año: se guarda como 1900 y solo se usa el día y el mes)
export function parseFecha(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let a; let mes; let d;
  if (m) [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/))) [d, mes, a] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})$/))) [d, mes, a] = [Number(m[1]), Number(m[2]), 1900];
  else return null;
  if (a > new Date().getFullYear() || (a < 1920 && a !== 1900)) return null;
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const fichas = (nombre) => normalizar(nombre).split(' ').filter((p) => p.length > 1);

export async function cargarIndice(env, colegioId) {
  const [al, ap, us, pe] = await Promise.all([
    env.DB.prepare("SELECT id, nombres, apellidos, dni, fecha_nacimiento FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegioId).all(),
    env.DB.prepare('SELECT id, nombres, apellidos, dni, telefono, fecha_nacimiento FROM apoderados WHERE colegio_id = ?').bind(colegioId).all(),
    env.DB.prepare("SELECT id, nombre, dni, telefono, fecha_nacimiento FROM usuarios WHERE colegio_id = ? AND rol != 'padre'").bind(colegioId).all(),
    env.DB.prepare('SELECT id, nombre, dni, telefono, fecha_nacimiento FROM personal WHERE colegio_id = ? AND activo = 1').bind(colegioId).all(),
  ]);
  const hacer = (tipo, filas, nombreDe) => filas.results.map((f) => ({ ...f, tipo, nombre: nombreDe(f), claves: new Set(fichas(nombreDe(f))) }));
  return [
    ...hacer('alumno', al, (f) => `${f.nombres} ${f.apellidos}`),
    ...hacer('apoderado', ap, (f) => `${f.nombres} ${f.apellidos}`),
    ...hacer('usuario', us, (f) => f.nombre),
    ...hacer('personal', pe, (f) => f.nombre),
  ];
}

// Devuelve las personas del colegio que corresponden a la fila: por DNI (todas las que lo tengan) o por nombre único
export function reconocer(indice, fila) {
  const dni = dniOk(fila.dni);
  if (dni) {
    const porDni = indice.filter((p) => p.dni === dni);
    if (porDni.length) return { personas: porDni, por: 'dni' };
  }
  const claves = fichas(fila.nombre);
  if (claves.length < 2) return { personas: [], por: null };
  const exactos = indice.filter((p) => p.claves.size === claves.length && claves.every((c) => p.claves.has(c)));
  const candidatos = exactos.length ? exactos : indice.filter((p) => claves.every((c) => p.claves.has(c)));
  // Mismo nombre en dos registros de la misma clase (dos "Luis Torres"), o entre un alumno y un adulto: no se adivina, hace falta el DNI.
  // Un adulto que aparece como padre y como docente con el mismo nombre se toma como la misma persona.
  const porTipo = new Map();
  for (const p of candidatos) porTipo.set(p.tipo, (porTipo.get(p.tipo) || 0) + 1);
  const repetido = [...porTipo.values()].some((n) => n > 1) || (porTipo.has('alumno') && porTipo.size > 1);
  if (candidatos.length && !repetido) return { personas: candidatos, por: 'nombre' };
  return { personas: [], por: null, ambiguo: candidatos.length > 1 };
}

const TABLA = { alumno: 'alumnos', apoderado: 'apoderados', usuario: 'usuarios', personal: 'personal' };
const CARGO_NO_PERSONAL = /alumn|estudiant|padre|madre|apoderad|famil/;

// Aplica un bloque de filas. No guarda nada si dry = true (vista previa).
export async function importarCumples(env, colegioId, filas, { dry = false } = {}) {
  const indice = await cargarIndice(env, colegioId);
  const res = { actualizados: 0, creados: 0, sin_fecha: 0, sin_coincidencia: [], ambiguos: [], detalle: [] };
  const sentencias = [];
  const tocados = new Set();
  for (const [i, f] of filas.entries()) {
    const fila = f._fila ?? i + 2;
    const fecha = parseFecha(f.fecha);
    const nombre = String(f.nombre || '').trim().slice(0, 80);
    if (!fecha) { res.sin_fecha++; res.detalle.push({ fila, nombre, error: 'Fecha no válida (usa 14/05/2016)' }); continue; }
    const tel = normalizarTelefono(f.telefono);
    const dni = dniOk(f.dni);
    const { personas, ambiguo } = reconocer(indice, { nombre, dni });
    if (!personas.length) {
      const cargo = String(f.cargo || '').trim();
      if (cargo && !CARGO_NO_PERSONAL.test(normalizar(cargo)) && nombre && tel) {
        if (!dry) sentencias.push(env.DB.prepare('INSERT INTO personal (colegio_id, nombre, cargo, telefono, fecha_nacimiento, dni) VALUES (?, ?, ?, ?, ?, ?)').bind(colegioId, nombre, cargo.slice(0, 40), tel, fecha, dni));
        res.creados++; res.detalle.push({ fila, nombre, resultado: 'Se añadió como personal' });
      } else if (ambiguo) res.ambiguos.push({ fila, nombre });
      else res.sin_coincidencia.push({ fila, nombre, dni });
      continue;
    }
    for (const p of personas) {
      const clave = `${p.tipo}-${p.id}`;
      if (tocados.has(clave)) continue;
      tocados.add(clave);
      const campos = ['fecha_nacimiento = ?'];
      const valores = [fecha];
      if (dni && !p.dni && !indice.some((x) => x.tipo === p.tipo && x.dni === dni)) { campos.push('dni = ?'); valores.push(dni); }
      if (tel && p.tipo !== 'alumno' && !p.telefono && !indice.some((x) => x.tipo === p.tipo && x.telefono === tel)) { campos.push('telefono = ?'); valores.push(tel); }
      if (!dry) sentencias.push(env.DB.prepare(`UPDATE ${TABLA[p.tipo]} SET ${campos.join(', ')} WHERE id = ? AND colegio_id = ?`).bind(...valores, p.id, colegioId));
      res.actualizados++;
      res.detalle.push({ fila, nombre: p.nombre, tipo: p.tipo, resultado: 'Cumpleaños registrado' });
    }
  }
  return { res, sentencias };
}

// Foto del DNI: lee nombre, número y fecha de nacimiento. No se guarda la foto.
export async function leerDni(env, imagen) {
  const r = await leerImagen(env, imagen,
    'Es la foto de un DNI peruano (cédula de identidad). Responde {"nombres":"nombres de pila","apellidos":"apellido paterno y materno","dni":"número de 8 dígitos o null","fecha_nacimiento":"AAAA-MM-DD o null"}. Copia exactamente lo que ves; si algo no se lee, usa null. La fecha de nacimiento NO es la fecha de emisión ni la de caducidad.',
    { json: true, maxTokens: 300 });
  return { nombre: `${String(r?.nombres || '').trim()} ${String(r?.apellidos || '').trim()}`.trim(), dni: dniOk(r?.dni), fecha: parseFecha(r?.fecha_nacimiento) };
}

// Quién tiene fecha y número (saldrá su saludo) y a quién le falta algo
export async function estadoCumples(env, colegioId, limite = 40) {
  const consentido = "EXISTS (SELECT 1 FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id WHERE aa.alumno_id = a.id AND ap.telefono IS NOT NULL AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = a.id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1)";
  const [alumnos, apoderados, personal] = await Promise.all([
    env.DB.prepare(`SELECT a.id, a.nombres, a.apellidos, a.grado, a.seccion, a.fecha_nacimiento, ${consentido} AS puede FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' ORDER BY a.grado, a.seccion, a.apellidos`).bind(colegioId).all(),
    env.DB.prepare(`SELECT ap.id, ap.nombres, ap.apellidos, ap.telefono, ap.fecha_nacimiento,
        EXISTS (SELECT 1 FROM alumno_apoderado aa WHERE aa.apoderado_id = ap.id AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = aa.alumno_id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1) AS autoriza
        FROM apoderados ap WHERE ap.colegio_id = ? AND EXISTS (SELECT 1 FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = ap.id AND a.estado = 'matriculado')`).bind(colegioId).all(),
    env.DB.prepare(`SELECT 'usuario' AS tipo, id, nombre, rol AS cargo, telefono, fecha_nacimiento FROM usuarios WHERE colegio_id = ? AND rol != 'padre' AND activo = 1
        UNION ALL SELECT 'personal', id, nombre, COALESCE(cargo, 'Personal'), telefono, fecha_nacimiento FROM personal WHERE colegio_id = ? AND activo = 1`).bind(colegioId, colegioId).all(),
  ]);
  const nombreAl = (a) => `${a.apellidos}, ${a.nombres} (${a.grado} ${a.seccion})`;
  const sinFecha = [
    ...alumnos.results.filter((a) => !a.fecha_nacimiento).map((a) => ({ tipo: 'Alumno', nombre: nombreAl(a) })),
    ...apoderados.results.filter((a) => !a.fecha_nacimiento).map((a) => ({ tipo: 'Padre/apoderado', nombre: `${a.apellidos}, ${a.nombres}` })),
    ...personal.results.filter((a) => !a.fecha_nacimiento).map((a) => ({ tipo: a.cargo, nombre: a.nombre })),
  ];
  const sinSaludo = [
    ...alumnos.results.filter((a) => a.fecha_nacimiento && !a.puede).map((a) => ({ tipo: 'Alumno', nombre: nombreAl(a), motivo: 'ningún apoderado con celular y autorización de WhatsApp' })),
    ...apoderados.results.filter((a) => a.fecha_nacimiento && (!a.telefono || !a.autoriza)).map((a) => ({ tipo: 'Padre/apoderado', nombre: `${a.apellidos}, ${a.nombres}`, motivo: !a.telefono ? 'sin celular' : 'sin autorización de WhatsApp' })),
    ...personal.results.filter((a) => a.fecha_nacimiento && !a.telefono).map((a) => ({ tipo: a.cargo, nombre: a.nombre, motivo: 'sin celular' })),
  ];
  const cuenta = (filas) => ({ total: filas.length, con_fecha: filas.filter((x) => x.fecha_nacimiento).length });
  return {
    alumnos: cuenta(alumnos.results), apoderados: cuenta(apoderados.results), personal: cuenta(personal.results),
    sin_fecha: { total: sinFecha.length, lista: sinFecha.slice(0, limite) },
    sin_saludo: { total: sinSaludo.length, lista: sinSaludo.slice(0, limite) },
  };
}
