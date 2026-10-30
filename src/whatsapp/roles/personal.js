// Agente para el personal del colegio: profesor, contabilidad, secretaría y dirección.
// Cada rol ve solo lo que su permiso permite (mismas reglas que la web) y cada consulta
// queda en el registro de accesos con canal "whatsapp".
import { soles, hoyLima } from '../../lib/http.js';
import { tiene, alcanceAlumnos } from '../../lib/permisos.js';
import { consentidoAlumno } from '../../lib/consentimiento.js';
import { normalizar } from '../../lib/texto.js';
import { cuotasParaRecordar, enviarRecordatorios } from '../../rutas/pagos.js';
import { auditoria, buscarAlumnos, listaOpciones, encolar, apoderadosConPermiso } from '../comun.js';
import { responderDocente, utilesAlumno } from './docente.js';
import { ejecutarCarga } from './carga.js';
import { ejecutarRegistro } from './registro.js';
import { alumnosEnRiesgo } from '../../lib/riesgo.js';
import { sentenciasAsistencia } from '../../lib/asistencia.js';
import { responderAutomatizacion, ejecutarAutomatizada } from './automatizacion.js';

const MENUS = {
  profesor: '1️⃣ Crear un examen ("examen de 20 preguntas de fracciones para 2°")\n2️⃣ Planificar una sesión ("sesión sobre el ciclo del agua para 4°")\n3️⃣ Ver un alumno ("alumno Mateo Quispe")\n4️⃣ Asistencia de hoy ("asistencia: faltaron Mateo Quispe, Ana Paz; tarde Luis Ríos")\n5️⃣ Resultados de un examen ("resultados 12: Mateo Quispe 2 5 9")\n6️⃣ Radar de temas débiles\n7️⃣ Alumnos en riesgo\n8️⃣ Útiles de un alumno ("útiles Mateo Quispe")\n9️⃣ Avisar a los padres de mi aula ("avisar: mañana traer cartulina")\nNotas: "notas Matemática bimestre 4: Mateo Quispe 15; Ana Paz 18" o la FOTO del registro con la palabra "notas".\nTambién: "falta Mateo Quispe", "alergias", "tutor" (dudas de tus alumnos), "adaptar para TDAH: …", "traducir al inglés: …", "útiles faltantes" o mándame una foto del libro.\nTambién: *lista* para pasar lista (te muestro los alumnos y me dices quién faltó), un PDF o una página web para crear el examen, y *mi cumpleaños 12 de mayo* para que te saludemos.',
  contabilidad: '1️⃣ Resumen de cobranza\n2️⃣ Morosos\n3️⃣ Deuda de un alumno ("deuda Mateo Quispe")\n4️⃣ Registrar un pago ("pago Mateo Quispe octubre yape")\n5️⃣ Enviar recordatorios a los morosos\n6️⃣ Vouchers enviados por los padres\nTambién: *boleta Nombre del alumno* o *factura Nombre 20123456789 Razón Social* (después de registrar el pago).',
  secretaria: '1️⃣ Buscar alumno y contactos ("alumno Mateo Quispe")\n2️⃣ Mensajes de padres por atender\n3️⃣ Útiles ("útiles 3° Primaria" o "útiles Mateo Quispe")\n4️⃣ Autorizaciones pendientes\n5️⃣ Avisar a un grado ("avisar 3° Primaria: reunión el viernes 6 p. m.")\n6️⃣ Avisar útiles faltantes ("faltantes 3° Primaria")\n📸 Mándame la FOTO de una lista de útiles o de una ficha de matrícula, o el Excel, y lo cargo yo.\nTambién: *aprobar 12* / *rechazar 12* (comunicados automáticos), *reporte*, *cumpleaños*, *reinscripción*, *invitar* (a familias interesadas), *constancia Mateo Quispe*, *diploma Ana Paz: motivo*, *lista* y *mi cumpleaños 12 de mayo*.',
  direccion: '1️⃣ Resumen del colegio\n2️⃣ Deuda por grado\n3️⃣ Deuda de un aula ("¿cuánto deben en 3° Primaria B?")\n4️⃣ Alumnos en riesgo (alerta temprana)\n5️⃣ Comunicado a todos los padres ("comunicado: el lunes no hay clases")\n6️⃣ ¿Quién leyó el último comunicado?\n7️⃣ Quién consultó datos hoy\n8️⃣ Solicitudes ARCO pendientes\nTambién: "alumno Mateo Quispe", "examen de …", "traducir al inglés: …"\nTambién: *aprobar 12* / *rechazar 12* (comunicados automáticos), *reporte*, *cumpleaños*, *reinscripción*, *invitar* (a familias interesadas), *constancia Mateo Quispe*, *diploma Ana Paz: motivo*, *lista* y *mi cumpleaños 12 de mayo*.',
};
const TITULO = { profesor: 'Profesor', contabilidad: 'Contabilidad', secretaria: 'Secretaría', direccion: 'Dirección' };

export const menuPersonal = (persona, colegio) =>
  `Hola ${persona.nombre} 👋, soy el asistente de *${colegio.nombre}* para *${TITULO[persona.rol]}*.\n` +
  'Escríbeme o mándame un audio:\n' + MENUS[persona.rol] + '\n\nLo que consultes queda registrado (Ley 29733).';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MEDIOS = ['yape', 'plin', 'efectivo', 'transferencia', 'tarjeta', 'deposito'];
const fecha = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const pct = (x) => `${Math.round(x * 100)}%`;
const COSTO_PLANTILLA_USD = 0.02; // referencial; ver COSTOS.md

// ---------- Alumno: buscar, elegir y resumir ----------
export async function resolverAlumno(env, colegio, persona, consulta, intencion, extra = {}, alumnoId = null) {
  if (alumnoId) {
    const alcance = alcanceAlumnos(persona.usuario);
    const a = await env.DB.prepare(`SELECT a.* FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? AND ${alcance.sql}`)
      .bind(alumnoId, colegio.id, ...alcance.params).first();
    if (a) return { alumno: a };
  }
  if (!consulta) return { respuesta: { texto: '¿De qué alumno? Escribe su nombre o código.', pendiente: { accion: 'pedir', datos: { intencion, extra } } } };
  const alumnos = await buscarAlumnos(env, colegio, persona, consulta);
  if (!alumnos.length) {
    return { respuesta: { texto: `No encontré a "${consulta}" ${persona.rol === 'profesor' ? 'en tus secciones' : 'en el colegio'}. Prueba con apellido y nombre.` } };
  }
  if (alumnos.length > 1) {
    return { respuesta: { texto: `Encontré varios. Responde con el número:\n${listaOpciones(alumnos)}`, pendiente: { accion: 'elegir', datos: { intencion, ids: alumnos.map((a) => a.id), extra } } } };
  }
  return { alumno: alumnos[0] };
}

async function resumenAlumno(env, colegio, persona, a) {
  const u = persona.usuario;
  const hoy = hoyLima();
  const partes = [`👤 *${a.nombres} ${a.apellidos}*\n${a.grado} ${a.seccion} · código ${a.codigo}`];
  const secciones = ['personal'];
  if (tiene(u, 'ficha.academico')) {
    secciones.push('academico');
    const [notas, asis] = await env.DB.batch([
      env.DB.prepare('SELECT curso, nota, bimestre FROM notas WHERE alumno_id = ? AND bimestre = (SELECT MAX(bimestre) FROM notas WHERE alumno_id = ?) ORDER BY curso').bind(a.id, a.id),
      env.DB.prepare('SELECT SUM(dias_habiles) d, SUM(faltas) f, SUM(tardanzas) t FROM asistencia WHERE alumno_id = ?').bind(a.id),
    ]);
    if (notas.results.length) partes.push(`📝 ${notas.results[0].bimestre}° bimestre: ` + notas.results.map((n) => `${n.curso} ${n.nota}`).join(' · '));
    const s = asis.results[0];
    if (s?.d) partes.push(`🗓️ Asistencia ${Math.round(((s.d - s.f) / s.d) * 100)}% (${s.f} faltas, ${s.t} tardanzas)`);
  }
  if (tiene(u, 'ficha.salud') || tiene(u, 'ficha.salud_alertas')) {
    secciones.push('salud');
    if (await consentidoAlumno(env, a.id, 'salud')) {
      const alerta = [a.alergias && `alergia a ${a.alergias}`, a.condicion_medica].filter(Boolean).join(' · ');
      partes.push(alerta ? `⚠️ Salud: ${alerta}` : '🩺 Sin alertas de salud');
    } else partes.push('🩺 Salud: sin autorización del apoderado');
  }
  if (tiene(u, 'ficha.pagos') || tiene(u, 'ficha.pagos_estado')) {
    secciones.push('pagos');
    const p = await env.DB.prepare(
      "SELECT COUNT(*) n, COALESCE(SUM(monto_centimos), 0) m FROM pagos WHERE alumno_id = ? AND estado = 'pendiente' AND vencimiento < ?",
    ).bind(a.id, hoy).first();
    partes.push(p.n ? `💳 ${p.n} cuota(s) vencida(s)${tiene(u, 'ficha.pagos') ? ` por ${soles(p.m)}` : ''}` : '💳 Pagos al día');
  }
  if (tiene(u, 'ficha.apoderados')) {
    secciones.push('apoderados');
    const { results } = await env.DB.prepare(
      `SELECT ap.nombres, ap.apellidos, ap.telefono, aa.parentesco FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE aa.alumno_id = ? ORDER BY aa.responsable_pago DESC`,
    ).bind(a.id).all();
    partes.push(results.map((r) => `📱 ${r.parentesco || 'Apoderado'}: ${r.nombres} ${r.apellidos}${r.telefono ? ` +${r.telefono}` : ''}`).join('\n'));
  }
  await auditoria(env, colegio, persona, 'ver_ficha', 'alumno', a.id, { secciones }).run();
  return partes.join('\n');
}

// ---------- Profesor ----------
async function profesor(env, colegio, persona, { intencion, consulta, texto, alumnoId, extra = {} }) {
  const alcance = alcanceAlumnos(persona.usuario);
  switch (intencion) {
    case 'secciones': {
      const { results } = await env.DB.prepare(
        `SELECT a.grado, a.seccion, COUNT(*) n FROM alumnos a WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${alcance.sql} GROUP BY a.grado, a.seccion`,
      ).bind(colegio.id, ...alcance.params).all();
      return { texto: results.length ? '🏫 *Tus secciones*\n' + results.map((r) => `• ${r.grado} ${r.seccion}: ${r.n} alumnos`).join('\n') + '\n\nEscribe "alumno" y un nombre para ver su resumen.' : 'No tienes secciones asignadas. Pídele a dirección que te las asigne.' };
    }
    case 'alertas': {
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.nombres, a.apellidos, a.seccion, a.alergias, a.condicion_medica FROM alumnos a
          WHERE a.colegio_id = ? AND a.estado = 'matriculado' AND ${alcance.sql}
            AND (COALESCE(a.alergias, '') != '' OR COALESCE(a.condicion_medica, '') != '')
            AND EXISTS (SELECT 1 FROM consentimiento_vigente cv WHERE cv.alumno_id = a.id AND cv.finalidad = 'salud' AND cv.otorgado = 1)`,
      ).bind(colegio.id, ...alcance.params).all();
      await auditoria(env, colegio, persona, 'whatsapp_alertas_salud', null, null, { alumnos: results.map((r) => r.id) }).run();
      return { texto: results.length ? '⚠️ *Alertas de salud de tu aula*\n' + results.map((r) => `• ${r.nombres} ${r.apellidos} (${r.seccion}): ${[r.alergias && `alergia a ${r.alergias}`, r.condicion_medica].filter(Boolean).join(', ')}`).join('\n') : '✅ No hay alertas de salud registradas en tus secciones.' };
    }
    case 'falta': {
      const registro = extra.registro || (/tard/i.test(texto) ? 'tardanza' : 'falta');
      const r = await resolverAlumno(env, colegio, persona, consulta.replace(/\b(tardanza|tarde|lleg[oó] tarde|hoy)\b/gi, '').trim(), 'falta', { registro }, alumnoId);
      if (!r.alumno) return r.respuesta;
      return confirmar('falta', { alumno_id: r.alumno.id, registro }, `¿Registro una *${registro}* de hoy (${fecha(hoyLima())}) a *${r.alumno.nombres} ${r.alumno.apellidos}*? También se avisará a su apoderado. Responde *SI* o *NO*.`);
    }
    case 'avisar': {
      if (!consulta) return { texto: '¿Qué quieres avisar? Escribe por ejemplo: "avisar: mañana traer cartulina roja".', pendiente: { accion: 'pedir', datos: { intencion: 'avisar' } } };
      const dest = await apoderadosConPermiso(env, colegio, alcance.sql, alcance.params);
      return confirmar('aviso', { texto: consulta, alcance: 'profesor' },
        `Se enviará a *${dest.length} familias* de tus secciones (solo a quienes autorizaron WhatsApp):\n\n"${consulta}"\n\n¿Lo envío? Responde *SI* o *NO*.`);
    }
    case 'justificaciones': {
      const { results } = await env.DB.prepare(
        `SELECT au.usuario_nombre, au.detalle, au.creado_en, a.nombres, a.apellidos FROM auditoria au JOIN alumnos a ON a.id = au.entidad_id
          WHERE au.colegio_id = ? AND au.accion = 'justificacion_whatsapp' AND au.creado_en >= datetime('now', '-7 days') AND ${alcance.sql}
          ORDER BY au.id DESC LIMIT 10`,
      ).bind(colegio.id, ...alcance.params).all();
      return { texto: results.length ? '📩 *Justificaciones de los últimos 7 días*\n' + results.map((r) => `• ${r.nombres} ${r.apellidos}: "${JSON.parse(r.detalle || '{}').texto || ''}" (${r.usuario_nombre})`).join('\n') : 'No hay justificaciones en los últimos 7 días.' };
    }
    case 'alumno': {
      const r = await resolverAlumno(env, colegio, persona, consulta, 'alumno', {}, alumnoId);
      return r.alumno ? { texto: await resumenAlumno(env, colegio, persona, r.alumno) } : r.respuesta;
    }
  }
  return null;
}

// ---------- Contabilidad ----------
async function resumenCobranza(env, colegio) {
  const hoy = hoyLima();
  const f = await env.DB.prepare(
    `SELECT SUM(CASE WHEN estado = 'pendiente' AND vencimiento < ? THEN monto_centimos ELSE 0 END) vencido,
            SUM(CASE WHEN vencimiento < ? THEN monto_centimos ELSE 0 END) emitido,
            SUM(CASE WHEN estado = 'pagado' AND substr(pagado_en, 1, 7) = ? THEN monto_centimos ELSE 0 END) mes,
            COUNT(DISTINCT CASE WHEN estado = 'pendiente' AND vencimiento < ? THEN alumno_id END) morosos
       FROM pagos WHERE colegio_id = ? AND estado != 'anulado'`,
  ).bind(hoy, hoy, hoy.slice(0, 7), hoy, colegio.id).first();
  const total = (await env.DB.prepare("SELECT COUNT(*) n FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegio.id).first()).n;
  return { ...f, total, cobranza: f.emitido ? (f.emitido - f.vencido) / f.emitido : 1 };
}

async function contabilidad(env, colegio, persona, { intencion, consulta, alumnoId, extra = {} }) {
  switch (intencion) {
    case 'resumen': {
      const r = await resumenCobranza(env, colegio);
      return { texto: `💰 *Cobranza al ${fecha(hoyLima())}*\n• Cobranza del año: ${pct(r.cobranza)}\n• Deuda vencida: ${soles(r.vencido)}\n• Alumnos con deuda: ${r.morosos} de ${r.total} (${pct(r.morosos / (r.total || 1))})\n• Cobrado este mes: ${soles(r.mes)}\n\nEscribe *2* para ver los morosos.` };
    }
    case 'morosos': {
      const { results } = await env.DB.prepare(
        `SELECT a.nombres, a.apellidos, a.grado, a.seccion, a.codigo, COUNT(*) n, SUM(p.monto_centimos) m FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
          WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND p.vencimiento < ? GROUP BY a.id ORDER BY m DESC LIMIT 10`,
      ).bind(colegio.id, hoyLima()).all();
      await auditoria(env, colegio, persona, 'whatsapp_ver_morosos').run();
      return { texto: results.length ? '📋 *Mayores deudas vencidas*\n' + results.map((r, i) => `${i + 1}. ${r.apellidos}, ${r.nombres} (${r.grado} ${r.seccion}): ${soles(r.m)} · ${r.n} cuota(s)`).join('\n') + '\n\nEscribe *5* para enviarles recordatorio.' : '✅ No hay deudas vencidas.' };
    }
    case 'deuda_alumno': {
      const r = await resolverAlumno(env, colegio, persona, consulta, 'deuda_alumno', {}, alumnoId);
      if (!r.alumno) return r.respuesta;
      const a = r.alumno;
      const { results } = await env.DB.prepare("SELECT concepto, monto_centimos, vencimiento FROM pagos WHERE alumno_id = ? AND estado = 'pendiente' ORDER BY vencimiento").bind(a.id).all();
      await auditoria(env, colegio, persona, 'ver_ficha', 'alumno', a.id, { secciones: ['pagos'] }).run();
      const hoy = hoyLima();
      return { texto: `💳 *${a.nombres} ${a.apellidos}* (${a.grado} ${a.seccion})\n` + (results.length ? results.map((p) => `• ${p.concepto}: ${soles(p.monto_centimos)} ${p.vencimiento < hoy ? '⚠️ vencida' : `(vence ${fecha(p.vencimiento)})`}`).join('\n') + `\nTotal pendiente: ${soles(results.reduce((s, p) => s + p.monto_centimos, 0))}` : 'Al día ✅') };
    }
    case 'pagar': {
      const t = normalizar(consulta);
      const mes = extra.mes ?? MESES.find((m) => t.includes(m) || (m === 'septiembre' && t.includes('setiembre')));
      const matricula = extra.matricula ?? t.includes('matricula');
      const medio = extra.medio ?? (MEDIOS.find((m) => t.includes(m)) || 'efectivo');
      const nombre = consulta.replace(new RegExp(`\\b(${[...MESES, 'setiembre', ...MEDIOS, 'dep[oó]sito', 'pensi[oó]n', 'matr[ií]cula', 'de', 'con', 'por', 'en'].join('|')})\\b`, 'gi'), ' ').replace(/\s+/g, ' ').trim();
      const r = await resolverAlumno(env, colegio, persona, nombre, 'pagar', { mes, matricula, medio }, alumnoId);
      if (!r.alumno) return r.respuesta;
      return prepararPago(env, r.alumno, { mes, matricula, medio });
    }
    case 'vouchers': {
      const { results } = await env.DB.prepare(
        `SELECT r.*, ap.nombres, ap.apellidos, a.nombres AS alumno, p.concepto FROM pagos_reportados r
           JOIN apoderados ap ON ap.id = r.apoderado_id LEFT JOIN alumnos a ON a.id = r.alumno_id LEFT JOIN pagos p ON p.id = r.pago_id
          WHERE r.colegio_id = ? AND r.estado = 'pendiente' ORDER BY r.id LIMIT 10`,
      ).bind(colegio.id).all();
      return { texto: results.length ? '🧾 *Vouchers por validar*\n' + results.map((r) => `#${r.id} ${r.nombres} ${r.apellidos}${r.alumno ? ` (${r.alumno})` : ''}: ${r.monto_centimos ? soles(r.monto_centimos) : 'monto ilegible'} ${r.medio || ''} op. ${r.operacion || '—'}${r.concepto ? ` → ${r.concepto}` : ''}`).join('\n') + '\n\nEscribe *confirmar 12* o *rechazar 12*.' : '✅ No hay vouchers por validar.' };
    }
    case 'voucher_accion': {
      const [, accion, id] = normalizar(consulta).match(/^(confirmar|rechazar)(?: voucher)? (\d+)/) || [];
      const r = await env.DB.prepare("SELECT * FROM pagos_reportados WHERE id = ? AND colegio_id = ? AND estado = 'pendiente'").bind(Number(id), colegio.id).first();
      if (!r) return { texto: 'No encontré ese voucher pendiente.' };
      if (accion === 'rechazar') {
        await env.DB.prepare("UPDATE pagos_reportados SET estado = 'rechazado', revisado_por = ? WHERE id = ?").bind(persona.usuario.id, r.id).run();
        return { texto: `Voucher #${r.id} rechazado. Avísale al padre el motivo por la bandeja de la web o escríbele.` };
      }
      if (!r.pago_id) return { texto: 'No sé a qué cuota corresponde. Regístralo con "pago + nombre + mes + medio".' };
      return confirmar('pago', { pago_id: r.pago_id, medio: r.medio || 'yape', reportado_id: r.id }, `¿Confirmo el voucher #${r.id} por ${soles(r.monto_centimos || 0)} como pago de la cuota sugerida? Responde *SI* o *NO*.`);
    }
    case 'recordatorios': {
      const cuotas = await cuotasParaRecordar(env, colegio.id, 'vencido', 0, 40, true);
      if (!cuotas.length) return { texto: 'No hay cuotas vencidas para recordar (o ya se recordaron en los últimos días).' };
      return confirmar('recordatorios', {}, `Se enviará recordatorio a *${cuotas.length} familias* con cuotas vencidas que autorizaron WhatsApp (máximo 1 cada 5 días por cuota). Costo aprox. US$ ${(cuotas.length * COSTO_PLANTILLA_USD).toFixed(2)}. ¿Envío? Responde *SI* o *NO*.`);
    }
  }
  return null;
}

export async function prepararPago(env, a, { mes, matricula, medio }) {
  const concepto = matricula ? 'Matrícula%' : mes ? `Pensión ${mes}%` : '%';
  const cuota = await env.DB.prepare(
    "SELECT id, concepto, monto_centimos FROM pagos WHERE alumno_id = ? AND estado = 'pendiente' AND concepto LIKE ? ORDER BY vencimiento LIMIT 1",
  ).bind(a.id, concepto).first();
  if (!cuota) return { texto: `${a.nombres} ${a.apellidos} no tiene ${mes ? `la pensión de ${mes} ` : 'cuotas '}pendiente(s).` };
  return confirmar('pago', { pago_id: cuota.id, medio },
    `¿Registro el pago de *${cuota.concepto}* de *${a.nombres} ${a.apellidos}* por *${soles(cuota.monto_centimos)}* con ${medio}? Le enviaremos la constancia a su apoderado. Responde *SI* o *NO*.`);
}

// ---------- Secretaría ----------
async function secretaria(env, colegio, persona, { intencion, consulta, alumnoId }) {
  switch (intencion) {
    case 'alumno': {
      const r = await resolverAlumno(env, colegio, persona, consulta, 'alumno', {}, alumnoId);
      return r.alumno ? { texto: await resumenAlumno(env, colegio, persona, r.alumno) } : r.respuesta;
    }
    case 'por_atender': {
      const { results } = await env.DB.prepare(
        `SELECT g.telefono, g.n, ap.nombres, ap.apellidos, COALESCE(x.texto, x.transcripcion, '[audio]') AS ultimo
           FROM (SELECT telefono, MAX(id) AS id, COUNT(*) AS n FROM mensajes
                  WHERE colegio_id = ? AND estado = 'por_atender' GROUP BY telefono) g
           JOIN mensajes x ON x.id = g.id
           LEFT JOIN apoderados ap ON ap.colegio_id = x.colegio_id AND ap.telefono = g.telefono
          ORDER BY g.id DESC LIMIT 10`,
      ).bind(colegio.id).all();
      await auditoria(env, colegio, persona, 'whatsapp_ver_bandeja').run();
      return { texto: results.length ? '📥 *Mensajes por atender*\n' + results.map((r) => `• ${r.nombres ? `${r.nombres} ${r.apellidos}` : `+${r.telefono}`}: "${String(r.ultimo).slice(0, 80)}"`).join('\n') + '\n\nRespóndelos desde la web, sección WhatsApp.' : '✅ No hay mensajes por atender.' };
    }
    case 'utiles': {
      const grado = await gradoEn(env, colegio, consulta);
      if (!grado) return utilesAlumno(env, colegio, persona, { consulta, alumnoId });
      const lista = await env.DB.prepare('SELECT id, titulo, publicada FROM listas_utiles WHERE colegio_id = ? AND grado = ? ORDER BY anio DESC LIMIT 1').bind(colegio.id, grado).first();
      if (!lista) return { texto: `Aún no hay lista de útiles de ${grado}. Súbela desde la web (foto o Excel).` };
      const { results } = await env.DB.prepare('SELECT cantidad, descripcion FROM utiles_items WHERE lista_id = ? ORDER BY orden LIMIT 40').bind(lista.id).all();
      return { texto: `📚 *${lista.titulo}*${lista.publicada ? '' : ' (borrador)'}\n` + results.map((i) => `• ${i.cantidad || ''} ${i.descripcion}`).join('\n') };
    }
    case 'autorizaciones': {
      const f = await env.DB.prepare(
        `SELECT COUNT(*) n FROM alumno_apoderado aa JOIN alumnos a ON a.id = aa.alumno_id
          WHERE a.colegio_id = ? AND a.estado = 'matriculado'
            AND NOT EXISTS (SELECT 1 FROM consentimientos c WHERE c.apoderado_id = aa.apoderado_id AND c.alumno_id = a.id AND c.finalidad = 'whatsapp')`,
      ).bind(colegio.id).first();
      return { texto: `🔒 Hay *${f.n}* apoderados que aún no responden la autorización de WhatsApp. Cuando escriban al colegio, el asistente se la pedirá. También puedes registrar la firma en papel desde la web (Protección de datos).` };
    }
    case 'avisar': {
      const [antes, ...resto] = consulta.split(':');
      const grado = await gradoEn(env, colegio, antes);
      const mensaje = resto.join(':').trim();
      if (!grado || !mensaje) return { texto: 'Escríbelo así: "avisar 3° Primaria: reunión el viernes 6 p. m."' };
      const seccion = antes.match(/\b([A-F])\s*$/)?.[1];
      const dest = await apoderadosConPermiso(env, colegio, `a.grado = ?${seccion ? ' AND a.seccion = ?' : ''}`, seccion ? [grado, seccion] : [grado]);
      return confirmar('aviso', { texto: mensaje, grado, seccion: seccion || null },
        `Se enviará a *${dest.length} familias* de ${grado}${seccion ? ` ${seccion}` : ''} que autorizaron WhatsApp:\n\n"${mensaje}"\n\n¿Lo envío? Responde *SI* o *NO*.`);
    }
  }
  return null;
}

export async function gradoEn(env, colegio, texto) {
  const { results } = await env.DB.prepare("SELECT DISTINCT grado FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegio.id).all();
  const grados = results.map((r) => r.grado);
  const t = normalizar(texto).replace(/(\d)\s*(?:ro|do|to|vo|no|mo|er|o)?\b\s*/g, '$1 ');
  const exacto = grados.sort((a, b) => b.length - a.length).find((g) => t.includes(normalizar(g).replace(/(\d)\s*/g, '$1 ').trim()));
  if (exacto) return exacto;
  // "3ro B" sin nivel: primaria salvo que diga secundaria; "4 años" es inicial
  const n = t.match(/\b(\d)\b/)?.[1];
  if (!n) return null;
  const nivel = /\bsec/.test(t) ? 'Secundaria' : /\banos?\b|\binicial/.test(t) ? 'años' : 'Primaria';
  return grados.find((g) => g.startsWith(n) && g.includes(nivel)) || null;
}

// ---------- Dirección ----------
// También lo usa el resumen diario que llega a la directora cada mañana
export async function resumenColegio(env, colegio) {
  const r = await resumenCobranza(env, colegio);
  const [arco, chats, accesos, vouchers, faltas] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) n FROM solicitudes_arco WHERE colegio_id = ? AND estado = 'pendiente'").bind(colegio.id),
    env.DB.prepare("SELECT COUNT(DISTINCT telefono) n FROM mensajes WHERE colegio_id = ? AND estado = 'por_atender'").bind(colegio.id),
    env.DB.prepare("SELECT COUNT(*) n FROM auditoria WHERE colegio_id = ? AND accion = 'ver_ficha' AND creado_en >= date('now', '-1 day')").bind(colegio.id),
    env.DB.prepare("SELECT COUNT(*) n FROM pagos_reportados WHERE colegio_id = ? AND estado = 'pendiente'").bind(colegio.id),
    env.DB.prepare("SELECT COALESCE(SUM(json_extract(detalle, '$.faltas')), 0) n FROM auditoria WHERE colegio_id = ? AND accion = 'registrar_asistencia' AND creado_en >= date('now', '-1 day')").bind(colegio.id),
  ]);
  const riesgo = (await alumnosEnRiesgo(env, colegio.id, { sql: '1 = 1', params: [] })).length;
  return `📊 *${colegio.nombre}* — ${fecha(hoyLima())}\n• Matriculados: ${r.total}\n• Cobranza del año: ${pct(r.cobranza)}\n• Deuda vencida: ${soles(r.vencido)} (${r.morosos} alumnos, ${pct(r.morosos / (r.total || 1))} de morosidad)\n• Cobrado este mes: ${soles(r.mes)}\n• Vouchers por validar: ${vouchers.results[0].n}\n• Faltas registradas desde ayer: ${faltas.results[0].n}\n• Alumnos en riesgo: ${riesgo}\n• Chats de padres por atender: ${chats.results[0].n}\n• Solicitudes ARCO pendientes: ${arco.results[0].n}\n• Fichas consultadas desde ayer: ${accesos.results[0].n}`;
}

async function direccion(env, colegio, persona, { intencion, consulta, alumnoId }) {
  switch (intencion) {
    case 'resumen': {
      await auditoria(env, colegio, persona, 'ver_panel').run();
      return { texto: await resumenColegio(env, colegio) };
    }
    case 'deuda_grados': {
      const { results } = await env.DB.prepare(
        `SELECT a.grado, COUNT(DISTINCT a.id) n, SUM(p.monto_centimos) m FROM pagos p JOIN alumnos a ON a.id = p.alumno_id
          WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND p.vencimiento < ? GROUP BY a.grado ORDER BY m DESC LIMIT 14`,
      ).bind(colegio.id, hoyLima()).all();
      return { texto: '🏫 *Deuda vencida por grado*\n' + results.map((r) => `• ${r.grado}: ${soles(r.m)} (${r.n} alumnos)`).join('\n') };
    }
    case 'deuda_aula': {
      const grado = await gradoEn(env, colegio, consulta);
      if (!grado) return { texto: 'No identifiqué el aula. Ejemplo: "¿cuánto deben en 3° Primaria B?"' };
      const seccion = consulta.match(/\b([A-F])\b\s*\??\s*$/)?.[1] || consulta.match(/\b(?:secci[oó]n|aula)\s+([A-F])\b/i)?.[1];
      const filtro = seccion ? ' AND a.seccion = ?' : '';
      const params = seccion ? [grado, seccion] : [grado];
      const hoy = hoyLima();
      const [deuda, mes, top] = (await env.DB.batch([
        env.DB.prepare(`SELECT COUNT(DISTINCT a.id) n, COALESCE(SUM(p.monto_centimos), 0) m FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND p.vencimiento < ? AND a.grado = ?${filtro}`).bind(colegio.id, hoy, ...params),
        env.DB.prepare(`SELECT COUNT(*) total, SUM(p.estado = 'pagado') pagados FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.colegio_id = ? AND p.periodo = ? AND a.grado = ?${filtro}`).bind(colegio.id, hoy.slice(0, 7), ...params),
        env.DB.prepare(`SELECT a.nombres, a.apellidos, SUM(p.monto_centimos) m FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.colegio_id = ? AND p.estado = 'pendiente' AND p.vencimiento < ? AND a.grado = ?${filtro} GROUP BY a.id ORDER BY m DESC LIMIT 5`).bind(colegio.id, hoy, ...params),
      ])).map((x) => x.results);
      const d = deuda[0];
      const m = mes[0];
      const barra = m.total ? '▮'.repeat(Math.round((m.pagados / m.total) * 10)) + '▯'.repeat(10 - Math.round((m.pagados / m.total) * 10)) : '';
      return { texto: `🏫 *${grado}${seccion ? ` ${seccion}` : ''}*\n• Deuda vencida: ${soles(d.m)} (${d.n} alumnos)\n• Pensión de este mes pagada: ${m.pagados || 0} de ${m.total || 0} ${barra}` + (top.length ? `\n\nMayores deudas:\n${top.map((t) => `• ${t.nombres} ${t.apellidos}: ${soles(t.m)}`).join('\n')}` : '') };
    }
    case 'lectura': {
      const lote = await env.DB.prepare("SELECT lote, MIN(creado_en) creado, MAX(texto) texto FROM wa_cola WHERE colegio_id = ? AND lote IS NOT NULL AND motivo IN ('aviso', 'comunicado') GROUP BY lote ORDER BY MAX(id) DESC LIMIT 1").bind(colegio.id).first();
      if (!lote) return { texto: 'Todavía no se ha enviado ningún comunicado.' };
      const e = await env.DB.prepare(
        `SELECT COUNT(*) total, SUM(q.enviado_en IS NOT NULL) enviados, SUM(m.entrega IN ('delivered', 'read')) entregados, SUM(m.entrega = 'read') leidos, SUM(m.canal = 'simulado') simulados
           FROM wa_cola q LEFT JOIN mensajes m ON m.id = q.mensaje_id WHERE q.colegio_id = ? AND q.lote = ?`,
      ).bind(colegio.id, lote.lote).first();
      return { texto: `📬 *Último comunicado* (${lote.creado.slice(0, 16)})\n"${String(lote.texto).slice(0, 120)}"\n• Enviados: ${e.enviados} de ${e.total}\n• Entregados: ${e.entregados || 0}\n• ✔✔ Leídos: ${e.leidos || 0}` + (e.simulados ? `\n(${e.simulados} en modo simulado: la confirmación de lectura llega con WhatsApp real)` : '') };
    }
    case 'accesos': {
      const { results } = await env.DB.prepare(
        `SELECT usuario_nombre, rol, COUNT(*) n FROM auditoria WHERE colegio_id = ? AND creado_en >= date('now') AND accion NOT IN ('login')
          GROUP BY usuario_id, usuario_nombre, rol ORDER BY n DESC LIMIT 10`,
      ).bind(colegio.id).all();
      return { texto: results.length ? '👁️ *Quién consultó datos hoy*\n' + results.map((r) => `• ${r.usuario_nombre || 'Sistema'} (${r.rol}): ${r.n} acciones`).join('\n') + '\n\nEl detalle está en la web, Registro de accesos.' : 'Hoy nadie ha consultado datos.' };
    }
    case 'arco': {
      const { results } = await env.DB.prepare(
        `SELECT s.tipo, s.detalle, s.creado_en, ap.nombres, ap.apellidos FROM solicitudes_arco s JOIN apoderados ap ON ap.id = s.apoderado_id
          WHERE s.colegio_id = ? AND s.estado = 'pendiente' ORDER BY s.id LIMIT 10`,
      ).bind(colegio.id).all();
      return { texto: results.length ? '⚖️ *Solicitudes ARCO pendientes*\n' + results.map((r) => `• ${r.tipo} — ${r.nombres} ${r.apellidos} (${r.creado_en.slice(0, 10)}): ${r.detalle.slice(0, 80)}`).join('\n') + '\n\nResponde desde la web, Protección de datos.' : '✅ No hay solicitudes ARCO pendientes.' };
    }
    case 'comunicado': {
      if (!consulta) return { texto: '¿Qué quieres comunicar? Escríbelo así: "comunicado: el lunes no hay clases por feriado".', pendiente: { accion: 'pedir', datos: { intencion: 'comunicado' } } };
      const dest = await apoderadosConPermiso(env, colegio, '1 = 1', []);
      return confirmar('aviso', { texto: consulta, todos: true },
        `Se enviará a *${dest.length} familias* que autorizaron WhatsApp:\n\n"${consulta}"\n\nCosto aprox. US$ ${(dest.length * COSTO_PLANTILLA_USD).toFixed(2)}. Se envía por tandas durante el día. ¿Lo envío? Responde *SI* o *NO*.`);
    }
    case 'alumno': {
      const r = await resolverAlumno(env, colegio, persona, consulta, 'alumno', {}, alumnoId);
      return r.alumno ? { texto: await resumenAlumno(env, colegio, persona, r.alumno) } : r.respuesta;
    }
  }
  return null;
}

const confirmar = (tipo, datos, texto) => ({ texto, pendiente: { accion: 'confirmar', datos: { tipo, ...datos } } });

export async function responderPersonal(env, colegio, persona, entrada) {
  const manejadores = { profesor, contabilidad, secretaria, direccion };
  if (entrada.intencion === 'menu') return { texto: menuPersonal(persona, colegio) };
  if (entrada.intencion === 'gracias') return { texto: '¡De nada! Escribe *MENÚ* cuando me necesites.' };
  const r = (await responderAutomatizacion(env, colegio, persona, entrada)) || (await responderDocente(env, colegio, persona, entrada)) || (await manejadores[persona.rol](env, colegio, persona, entrada));
  return r || { texto: `No entendí 🤔. Esto es lo que puedo hacer:\n${MENUS[persona.rol]}` };
}

// Ejecuta una acción confirmada con "SI"
export async function ejecutarConfirmada(env, colegio, persona, datos, { notificar, enviarCola }) {
  const u = persona.usuario;
  const extra = await ejecutarAutomatizada(env, colegio, persona, datos, { notificar, enviarCola });
  if (extra !== null) return extra;
  if (datos.tipo === 'notas' || datos.tipo === 'asistencia_aula') return ejecutarRegistro(env, colegio, persona, datos, notificar);
  if (['guardar_utiles', 'matricula', 'excel_alumnos'].includes(datos.tipo)) {
    if (!tiene(u, 'alumnos.editar') && !tiene(u, 'utiles.editar')) return 'Tu rol no puede cargar datos.';
    return ejecutarCarga(env, colegio, persona, datos);
  }
  if (datos.tipo === 'pago') {
    if (!tiene(u, 'pagos.editar')) return 'Tu rol no puede registrar pagos.';
    const p = await env.DB.prepare(
      `SELECT p.*, a.nombres, a.apellidos FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.id = ? AND p.colegio_id = ?`,
    ).bind(datos.pago_id, colegio.id).first();
    if (!p || p.estado !== 'pendiente') return 'Esa cuota ya no está pendiente.';
    if (datos.reportado_id) {
      await env.DB.prepare("UPDATE pagos_reportados SET estado = 'confirmado', revisado_por = ? WHERE id = ?").bind(u.id, datos.reportado_id).run();
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE pagos SET estado = 'pagado', pagado_en = ?, medio = ?, registrado_por = ? WHERE id = ?").bind(hoyLima(), datos.medio, u.id, p.id),
      auditoria(env, colegio, persona, 'registrar_pago', 'alumno', p.alumno_id, { pago_id: p.id, medio: datos.medio }),
    ]);
    const ap = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.telefono FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE aa.alumno_id = ? AND aa.responsable_pago = 1 AND ap.telefono IS NOT NULL`,
    ).bind(p.alumno_id).first();
    let aviso = '';
    if (ap && (await consentidoPadre(env, ap.id, p.alumno_id))) {
      await notificar(ap, `✅ Recibimos el pago de *${p.concepto}* de ${p.nombres} por ${soles(p.monto_centimos)} (${datos.medio}) el ${fecha(hoyLima())}. ¡Gracias!`);
      aviso = ` y le envié la constancia a ${ap.nombres}`;
    }
    return `✅ Pago registrado: ${p.concepto} de ${p.nombres} ${p.apellidos}${aviso}.`;
  }
  if (datos.tipo === 'falta') {
    if (!tiene(u, 'ficha.academico')) return 'Tu rol no puede registrar asistencia.';
    const al = alcanceAlumnos(u);
    const a = await env.DB.prepare(`SELECT a.* FROM alumnos a WHERE a.id = ? AND a.colegio_id = ? AND ${al.sql}`).bind(datos.alumno_id, colegio.id, ...al.params).first();
    if (!a) return 'No encontré al alumno en tus secciones.';
    const columna = datos.registro === 'tardanza' ? 'tardanzas' : 'faltas';
    await env.DB.batch([
      ...(await sentenciasAsistencia(env, colegio.id, hoyLima(), [{ alumnoId: a.id, estado: columna === 'faltas' ? 'falta' : 'tardanza' }], u.id)),
      auditoria(env, colegio, persona, 'registrar_asistencia', 'alumno', a.id, { tipo: columna }),
    ]);
    const ap = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.telefono FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE aa.alumno_id = ? AND ap.telefono IS NOT NULL ORDER BY aa.responsable_pago DESC LIMIT 1`,
    ).bind(a.id).first();
    let aviso = '';
    if (ap && (await consentidoPadre(env, ap.id, a.id))) {
      await notificar(ap, `📋 Hoy ${fecha(hoyLima())} registramos una *${columna === 'faltas' ? 'falta' : 'tardanza'}* de ${a.nombres}. Si fue por un motivo justificado, cuéntanos por aquí.`);
      aviso = ` y avisé a ${ap.nombres}`;
    }
    return `✅ ${columna === 'faltas' ? 'Falta' : 'Tardanza'} registrada para ${a.nombres} ${a.apellidos}${aviso}.`;
  }
  if (datos.tipo === 'recordatorios') {
    if (!tiene(u, 'recordatorios.enviar')) return 'Tu rol no puede enviar recordatorios.';
    const cuotas = await cuotasParaRecordar(env, colegio.id, 'vencido', 0, 40, true);
    const r = await enviarRecordatorios(env, colegio, cuotas, 'manual', u.id);
    await auditoria(env, colegio, persona, 'enviar_recordatorios', null, null, r).run();
    return `✅ Recordatorios: ${r.enviados} enviados por WhatsApp, ${r.simulados} simulados, ${r.errores} con error.`;
  }
  if (datos.tipo === 'aviso') {
    let dest;
    if (datos.todos && u.rol === 'direccion') dest = await apoderadosConPermiso(env, colegio, '1 = 1', []);
    else if (datos.alcance === 'profesor') { const al = alcanceAlumnos(u); dest = await apoderadosConPermiso(env, colegio, al.sql, al.params); }
    else if (datos.grado && tiene(u, 'utiles.editar')) dest = await apoderadosConPermiso(env, colegio, `a.grado = ?${datos.seccion ? ' AND a.seccion = ?' : ''}`, datos.seccion ? [datos.grado, datos.seccion] : [datos.grado]);
    else return 'Tu rol no puede enviar ese aviso.';
    const firma = `\n— ${u.nombre.split(' (')[0]}, ${colegio.nombre}`;
    const n = await encolar(env, colegio, dest, `${datos.texto}${firma}`, datos.todos ? 'comunicado' : 'aviso', u.id);
    await auditoria(env, colegio, persona, 'enviar_aviso', null, null, { destinatarios: n }).run();
    const enviados = await enviarCola(30);
    return `✅ Aviso en camino a ${n} familias. Ya salieron ${Math.min(enviados, n)}; el resto se envía por tandas durante el día.`;
  }
  return 'Esa acción ya no está disponible.';
}

async function consentidoPadre(env, apoderadoId, alumnoId) {
  const c = await env.DB.prepare(
    "SELECT otorgado FROM consentimientos WHERE apoderado_id = ? AND alumno_id = ? AND finalidad = 'whatsapp' ORDER BY id DESC LIMIT 1",
  ).bind(apoderadoId, alumnoId).first();
  return c?.otorgado === 1;
}
