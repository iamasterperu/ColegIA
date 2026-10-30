// Notas y asistencia por WhatsApp. El profesor escribe (o manda la foto del registro) y
// ColegIA arma la lista, la muestra y solo guarda cuando responde "SI".
import { sentenciasAsistencia } from '../../lib/asistencia.js';
import { alcanceAlumnos, tiene } from '../../lib/permisos.js';
import { normalizar } from '../../lib/texto.js';
import { hoyLima } from '../../lib/http.js';
import { leerImagen, hayIA } from '../../ia/modelo.js';
import { auditoria, buscarAlumnos } from '../comun.js';

const NOTA = /^(AD|A|B|C|\d{1,2}(?:[.,]\d)?)$/i;

// Bimestres del año escolar peruano (marzo a diciembre)
export function bimestreActual(fecha = hoyLima()) {
  const mes = Number(fecha.slice(5, 7));
  return mes <= 5 ? 1 : mes <= 7 ? 2 : mes <= 9 ? 3 : 4;
}

const titulo = (s) => s.trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

async function cursoOficial(env, colegio, texto) {
  const { results } = await env.DB.prepare('SELECT DISTINCT curso FROM notas WHERE colegio_id = ? LIMIT 60').bind(colegio.id).all();
  const t = normalizar(texto);
  return results.map((r) => r.curso).find((c) => t.includes(normalizar(c)) || normalizar(c).startsWith(t)) || titulo(texto);
}

// "Mateo Quispe 15; Ana Paz AD" o una por línea
function separarFilas(texto) {
  return String(texto).split(/[;\n]+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const partes = l.split(/[\s,:-]+/);
    const nota = partes[partes.length - 1];
    return NOTA.test(nota) ? { nombre: partes.slice(0, -1).join(' '), nota: nota.toUpperCase().replace(',', '.') } : { nombre: l, nota: null };
  });
}

async function resolverFilas(env, colegio, persona, filas) {
  const ok = [];
  const dudas = [];
  for (const f of filas.slice(0, 45)) {
    if (!f.nota || !f.nombre) { dudas.push(f.nombre || '?'); continue; }
    const a = await buscarAlumnos(env, colegio, persona, f.nombre, 2);
    if (a.length === 1) ok.push({ alumno_id: a[0].id, nombre: `${a[0].nombres} ${a[0].apellidos}`, nota: f.nota });
    else dudas.push(f.nombre);
  }
  return { ok, dudas };
}

function confirmarNotas(curso, bimestre, ok, dudas, origen = '') {
  if (!ok.length) return { texto: `No identifiqué alumnos${origen}. Escríbelo así:\n*notas Matemática bimestre 4: Mateo Quispe 15; Ana Paz 18*` };
  return {
    texto: `📝 *${curso} — ${bimestre}° bimestre*${origen}\n${ok.map((n) => `• ${n.nombre}: ${n.nota}`).join('\n')}` +
      (dudas.length ? `\n\n⚠️ No identifiqué: ${dudas.join(', ')}` : '') + `\n\n¿Guardo ${ok.length === 1 ? 'esta nota' : `estas ${ok.length} notas`}? Responde *SI* o *NO*.`,
    pendiente: { accion: 'confirmar', datos: { tipo: 'notas', curso, bimestre, notas: ok.map(({ alumno_id, nota }) => ({ alumno_id, nota })) } },
  };
}

// "notas Matemática bimestre 4: Mateo Quispe 15; Ana Paz AD"
export async function notasPorTexto(env, colegio, persona, texto) {
  let [cabecera, ...resto] = texto.split(':');
  let cuerpo = resto.join(':');
  const bimestre = Number(texto.match(/bimestre\s*(\d)/i)?.[1]) || bimestreActual();
  let pista = cabecera.replace(/^\s*(registrar |subir |cargar |poner )?notas?\s*(de |del )?/i, '').replace(/bimestre\s*\d/i, '').trim();
  if (!resto.length) {
    // Sin dos puntos: "notas Comunicación Danna Torres 17" → la primera palabra es el curso
    [pista, ...resto] = pista.split(/\s+/);
    cuerpo = resto.join(' ');
  }
  const curso = await cursoOficial(env, colegio, pista || 'General');
  const { ok, dudas } = await resolverFilas(env, colegio, persona, separarFilas(cuerpo));
  return confirmarNotas(curso, bimestre, ok, dudas);
}

// Foto del registro auxiliar de notas
export async function notasPorFoto(env, colegio, persona, imagen, caption) {
  if (!hayIA(env)) return { texto: 'No puedo leer fotos en este momento. Escribe las notas como texto.' };
  const r = await leerImagen(env, imagen,
    'Es un registro de notas escolar. Responde {"curso":"curso si aparece","bimestre":número o null,"notas":[{"alumno":"apellidos y nombres tal como aparecen","nota":"AD, A, B, C o número de 0 a 20"}]}. Copia exactamente; si una nota no se lee, omite esa fila.',
    { json: true, maxTokens: 1800 });
  const filas = (r.notas || []).filter((n) => n?.alumno && NOTA.test(String(n.nota).trim())).map((n) => ({ nombre: n.alumno, nota: String(n.nota).trim().toUpperCase() }));
  const pista = String(caption || '').replace(/notas?|registro/gi, '').trim();
  const curso = await cursoOficial(env, colegio, pista || r.curso || 'General');
  const bimestre = Number(String(caption).match(/bimestre\s*(\d)/i)?.[1]) || Number(r.bimestre) || bimestreActual();
  const { ok, dudas } = await resolverFilas(env, colegio, persona, filas);
  return confirmarNotas(curso, bimestre, ok, dudas, ' (leído de la foto)');
}

// "asistencia: faltaron Mateo Quispe, Ana Paz; tarde Luis Huamán"
export async function asistenciaAula(env, colegio, persona, texto) {
  const faltas = [];
  const tardanzas = [];
  const dudas = [];
  const t = texto.replace(/^\s*(asistencia|pase de lista|lista de hoy)\s*(de hoy)?\s*:?\s*/i, '');
  for (const bloque of t.split(/[;\n]+/)) {
    const tarde = /\b(tarde|tardanza|tardanzas|llegaron tarde)\b/i.test(bloque);
    const nombres = bloque.replace(/\b(faltaron|falt[oó]|faltas?|ausentes?|no vinieron|no vino|llegaron tarde|tardanzas?|tarde|hoy)\b/gi, ' ')
      .split(/,|\by\b/).map((n) => n.trim()).filter((n) => n.length > 2);
    for (const n of nombres.slice(0, 40)) {
      const a = await buscarAlumnos(env, colegio, persona, n, 2);
      if (a.length !== 1) { dudas.push(n); continue; }
      (tarde ? tardanzas : faltas).push({ id: a[0].id, nombre: `${a[0].nombres} ${a[0].apellidos}` });
    }
  }
  if (!faltas.length && !tardanzas.length) return { texto: 'Escríbelo así: *asistencia: faltaron Mateo Quispe, Ana Paz; tarde Luis Huamán*' };
  return {
    texto: `🗓️ *Asistencia de hoy (${hoyLima().split('-').reverse().slice(0, 2).join('/')})*\n` +
      (faltas.length ? `❌ Faltaron: ${faltas.map((f) => f.nombre).join(', ')}\n` : '') +
      (tardanzas.length ? `⏰ Tarde: ${tardanzas.map((f) => f.nombre).join(', ')}\n` : '') +
      (dudas.length ? `⚠️ No identifiqué: ${dudas.join(', ')}\n` : '') +
      '\n¿Lo registro y aviso a cada apoderado? Responde *SI* o *NO*.',
    pendiente: { accion: 'confirmar', datos: { tipo: 'asistencia_aula', faltas: faltas.map((f) => f.id), tardanzas: tardanzas.map((f) => f.id) } },
  };
}

export async function ejecutarRegistro(env, colegio, persona, datos, notificar) {
  const u = persona.usuario;
  if (!tiene(u, 'ficha.academico') || u.rol === 'padre') return 'Tu rol no puede registrar notas ni asistencia.';
  const al = alcanceAlumnos(u);
  const ids = datos.tipo === 'notas' ? datos.notas.map((n) => n.alumno_id) : [...datos.faltas, ...datos.tardanzas];
  if (!ids.length) return 'No había nada que registrar.';
  // Solo alumnos dentro del alcance del rol (un profesor, sus secciones)
  const { results: validos } = await env.DB.prepare(
    `SELECT a.id, a.nombres FROM alumnos a WHERE a.colegio_id = ? AND a.id IN (${ids.map(() => '?').join(',')}) AND ${al.sql}`,
  ).bind(colegio.id, ...ids, ...al.params).all();
  const permitidos = new Set(validos.map((v) => v.id));
  if (datos.tipo === 'notas') {
    const notas = datos.notas.filter((n) => permitidos.has(n.alumno_id));
    await env.DB.batch([
      ...notas.map((n) => env.DB.prepare(
        `INSERT INTO notas (colegio_id, alumno_id, curso, bimestre, nota) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(alumno_id, curso, bimestre) DO UPDATE SET nota = excluded.nota`,
      ).bind(colegio.id, n.alumno_id, datos.curso, datos.bimestre, n.nota)),
      auditoria(env, colegio, persona, 'registrar_notas', null, null, { curso: datos.curso, bimestre: datos.bimestre, alumnos: notas.length }),
    ]);
    return `✅ Guardé ${notas.length} notas de ${datos.curso} (${datos.bimestre}° bimestre). Los padres las ven al escribir "notas".`;
  }
  const registros = [
    ...datos.faltas.filter((x) => permitidos.has(x)).map((alumnoId) => ({ alumnoId, estado: 'falta' })),
    ...datos.tardanzas.filter((x) => permitidos.has(x)).map((alumnoId) => ({ alumnoId, estado: 'tardanza' })),
  ];
  const lotes = await sentenciasAsistencia(env, colegio.id, hoyLima(), registros, u.id);
  lotes.push(auditoria(env, colegio, persona, 'registrar_asistencia', null, null, { faltas: datos.faltas.length, tardanzas: datos.tardanzas.length }));
  await env.DB.batch(lotes);
  let avisados = 0;
  const nombre = new Map(validos.map((v) => [v.id, v.nombres]));
  for (const [lista, tipo] of [[datos.faltas, 'una falta'], [datos.tardanzas, 'una tardanza']]) {
    for (const id of lista.filter((x) => permitidos.has(x)).slice(0, 20)) {
      const ap = await env.DB.prepare(
        `SELECT ap.id, ap.nombres, ap.telefono FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
          WHERE aa.alumno_id = ? AND ap.telefono IS NOT NULL
            AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = aa.alumno_id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1
          ORDER BY aa.responsable_pago DESC LIMIT 1`,
      ).bind(id).first();
      if (!ap) continue;
      await notificar(ap, `📋 Hoy registramos ${tipo} de ${nombre.get(id)}. Si fue por un motivo justificado, cuéntanos por aquí.`);
      avisados++;
    }
  }
  return `✅ Asistencia registrada: ${datos.faltas.length} falta(s) y ${datos.tardanzas.length} tardanza(s). Avisé a ${avisados} apoderado(s).`;
}
