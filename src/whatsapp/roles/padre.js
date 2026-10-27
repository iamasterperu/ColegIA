// Agente para padres y apoderados: solo ve a sus hijos.
import { soles, hoyLima } from '../../lib/http.js';
import { FINALIDADES } from '../../lib/consentimiento.js';
import { auditoria, buscarAlumnos } from '../comun.js';
import { listaDeAlumno } from './docente.js';
import { normalizarTelefono, normalizar } from '../../lib/texto.js';
import { leerImagen, hayIA } from '../../ia/modelo.js';

export const menuPadre = (persona, colegio) =>
  `Hola ${persona.nombre} 👋, soy el asistente de WhatsApp de *${colegio.nombre}*.\n` +
  'Escríbeme o mándame un audio. Por ejemplo:\n' +
  '1️⃣ Pagos y deudas\n2️⃣ Cómo pagar\n3️⃣ Lista de útiles\n4️⃣ Notas\n5️⃣ Asistencia\n' +
  '6️⃣ Justificar una falta ("mañana Mateo no irá por cita médica")\n7️⃣ Hablar con secretaría\n8️⃣ Mis datos y autorizaciones\n9️⃣ Tutor IA para mi hijo\n\n' +
  '📸 ¿Ya pagaste? Mándame la foto del voucher de Yape o transferencia.\nEscribe *BAJA* si no deseas recibir mensajes.';

export async function hijosDe(env, apoderadoId) {
  return (await env.DB.prepare(
    `SELECT a.id, a.nombres, a.apellidos, a.grado, a.seccion FROM alumno_apoderado aa
       JOIN alumnos a ON a.id = aa.alumno_id WHERE aa.apoderado_id = ? AND a.estado = 'matriculado' ORDER BY a.id`,
  ).bind(apoderadoId).all()).results;
}

export async function tieneConsentimiento(env, apoderadoId) {
  const fila = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM consentimiento_vigente WHERE apoderado_id = ? AND finalidad = 'whatsapp' AND otorgado = 1`,
  ).bind(apoderadoId).first();
  return fila.n > 0;
}

export async function registrarConsentimientoWa(env, colegio, apoderadoId, hijos, otorgado) {
  await env.DB.batch(hijos.map((h) => env.DB.prepare(
    `INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio)
     VALUES (?, ?, ?, 'whatsapp', ?, ?, 'whatsapp')`,
  ).bind(colegio.id, apoderadoId, h.id, otorgado ? 1 : 0, FINALIDADES.whatsapp.version)));
}

async function respuestaDeuda(env, hijos) {
  const hoy = hoyLima();
  const ids = hijos.map((h) => h.id);
  const { results } = await env.DB.prepare(
    `SELECT alumno_id, concepto, monto_centimos, vencimiento FROM pagos
      WHERE alumno_id IN (${ids.map(() => '?').join(',')}) AND estado = 'pendiente' ORDER BY vencimiento`,
  ).bind(...ids).all();
  if (!results.length) return '✅ No tienes cuotas pendientes. ¡Gracias por estar al día!';
  let total = 0;
  const partes = hijos.map((h) => {
    const cuotas = results.filter((p) => p.alumno_id === h.id);
    if (!cuotas.length) return `*${h.nombres}*: al día ✅`;
    return `*${h.nombres}* (${h.grado} ${h.seccion}):\n` + cuotas.map((p) => {
      total += p.monto_centimos;
      const venc = p.vencimiento < hoy ? '⚠️ vencida' : `vence ${fechaCorta(p.vencimiento)}`;
      return `• ${p.concepto}: ${soles(p.monto_centimos)} (${venc})`;
    }).join('\n');
  });
  return partes.join('\n\n') + `\n\n*Total pendiente: ${soles(total)}*\nEscribe *CÓMO PAGO* para ver las cuentas del colegio, o mándame la foto de tu voucher.`;
}

async function respuestaUtiles(env, colegio, hijos) {
  const partes = [];
  for (const h of hijos) {
    const l = await listaDeAlumno(env, colegio, h);
    const publicada = l && (await env.DB.prepare('SELECT publicada FROM listas_utiles WHERE id = ?').bind(l.id).first())?.publicada;
    if (!l || !publicada) { partes.push(`*${h.nombres}*: todavía no se publica la lista de útiles de ${h.grado}.`); continue; }
    const entregados = l.items.filter((i) => i.entregado);
    const faltan = l.items.filter((i) => !i.entregado);
    const fila = (i) => `• ${i.cantidad ? i.cantidad + ' ' : ''}${i.descripcion}`;
    if (entregados.length && faltan.length) partes.push(`📚 *${h.nombres}* ya entregó ${entregados.length} de ${l.items.length}. *Solo falta:*\n${faltan.map(fila).join('\n')}`);
    else if (!faltan.length) partes.push(`📚 *${h.nombres}*: ¡entregó toda la lista! ✅`);
    else partes.push(`📚 *${l.titulo}* (${h.nombres})\n${l.items.map(fila).join('\n')}`);
  }
  return partes.join('\n\n');
}

async function respuestaNotas(env, hijos) {
  const partes = [];
  for (const h of hijos) {
    const { results } = await env.DB.prepare(
      `SELECT curso, nota, bimestre FROM notas WHERE alumno_id = ?
         AND bimestre = (SELECT MAX(bimestre) FROM notas WHERE alumno_id = ?) ORDER BY curso`,
    ).bind(h.id, h.id).all();
    partes.push(results.length
      ? `📝 *${h.nombres}* — ${results[0].bimestre}° bimestre:\n` + results.map((n) => `• ${n.curso}: ${n.nota}`).join('\n')
      : `*${h.nombres}*: aún no hay notas registradas.`);
  }
  return partes.join('\n\n');
}

const NIVEL = { AD: 4, A: 3, B: 2, C: 1 };
const valorNota = (n) => NIVEL[n] ?? (Number(n) >= 18 ? 4 : Number(n) >= 14 ? 3 : Number(n) >= 11 ? 2 : 1);
const tendencia = (notas) => {
  if (notas.length < 2) return '';
  const d = valorNota(notas.at(-1).nota) - valorNota(notas.at(-2).nota);
  return d > 0 ? ' 📈 subió' : d < 0 ? ' 📉 bajó' : ' ➡️ se mantiene';
};

// "¿Cómo le fue en matemática?": notas del año, temas de examen que falló y lo que practicó con el tutor
async function respuestaCurso(env, colegio, hijos, consulta) {
  const q = normalizar(consulta);
  const elegidos = hijos.filter((h) => q.includes(normalizar(h.nombres.split(' ')[0])));
  const partes = [];
  for (const h of elegidos.length ? elegidos : hijos) {
    const { results: notas } = await env.DB.prepare('SELECT curso, bimestre, nota FROM notas WHERE alumno_id = ? ORDER BY curso, bimestre').bind(h.id).all();
    const cursos = [...new Set(notas.map((n) => n.curso))];
    const curso = cursos.find((c) => q.includes(normalizar(c)) || normalizar(c).split(' ').some((w) => w.length > 4 && q.includes(w)));
    if (!curso) {
      // Sin curso: resumen general con la última nota y la tendencia de cada curso
      partes.push(notas.length
        ? `📚 *${h.nombres}* en el año:\n` + cursos.map((c) => {
          const n = notas.filter((x) => x.curso === c);
          return `• ${c}: ${n.map((x) => x.nota).join(' → ')}${tendencia(n)}`;
        }).join('\n')
        : `*${h.nombres}*: aún no hay notas registradas.`);
      continue;
    }
    const n = notas.filter((x) => x.curso === curso);
    let texto = `📚 *${h.nombres} en ${curso}*\n` + n.map((x) => `• ${x.bimestre}° bimestre: ${x.nota}`).join('\n') + (tendencia(n) ? `\nTendencia:${tendencia(n)}` : '');
    const { results: examenes } = await env.DB.prepare(
      `SELECT d.titulo, d.contenido, r.falladas, r.puntaje FROM examen_resultados r JOIN documentos d ON d.id = r.documento_id
        WHERE r.alumno_id = ? AND d.colegio_id = ? ORDER BY r.creado_en DESC LIMIT 5`,
    ).bind(h.id, colegio.id).all();
    const temas = new Map();
    for (const e of examenes) {
      const ex = JSON.parse(e.contenido);
      if (ex.curso && normalizar(ex.curso).slice(0, 6) !== normalizar(curso).slice(0, 6)) continue;
      for (const k of JSON.parse(e.falladas)) {
        const tema = ex.preguntas?.[k - 1]?.tema;
        if (tema) temas.set(tema, (temas.get(tema) || 0) + 1);
      }
    }
    if (temas.size) texto += `\n\n🎯 Temas a reforzar (según sus exámenes): ${[...temas].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ')}.`;
    const { results: tutor } = await env.DB.prepare(
      `SELECT tema, MAX(trabado) AS trabado FROM tutor_temas WHERE alumno_id = ? AND creado_en > datetime('now', '-30 days')
        GROUP BY tema ORDER BY COUNT(*) DESC LIMIT 3`,
    ).bind(h.id).all();
    if (tutor.length) texto += `\n🤖 Practicó con el tutor IA: ${tutor.map((t) => t.tema + (t.trabado ? ' (le costó)' : '')).join(', ')}.`;
    partes.push(texto);
  }
  return partes.join('\n\n') + '\n\nSi quieres conversar con su profesor, escribe *HABLAR CON SECRETARÍA*.';
}

async function respuestaAsistencia(env, hijos) {
  const partes = [];
  for (const h of hijos) {
    const f = await env.DB.prepare(
      'SELECT SUM(dias_habiles) AS dias, SUM(faltas) AS faltas, SUM(tardanzas) AS tardanzas FROM asistencia WHERE alumno_id = ?',
    ).bind(h.id).first();
    if (!f?.dias) { partes.push(`*${h.nombres}*: sin registros de asistencia.`); continue; }
    const pct = Math.round(((f.dias - f.faltas) / f.dias) * 100);
    partes.push(`🗓️ *${h.nombres}*: ${pct}% de asistencia en el año (${f.faltas} faltas, ${f.tardanzas} tardanzas).`);
  }
  return partes.join('\n');
}

const fechaCorta = (iso) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};


// Justificación: queda para secretaría y se avisa al tutor de la sección por WhatsApp
async function justificar(env, colegio, persona, hijos, texto, avisarTutor) {
  let hijo = hijos.length === 1 ? hijos[0] : null;
  if (!hijo) {
    const encontrados = await buscarAlumnos(env, colegio, persona, texto);
    hijo = encontrados.length === 1 ? encontrados[0] : hijos.find((h) => texto.toLowerCase().includes(h.nombres.split(' ')[0].toLowerCase()));
  }
  if (!hijo) return { texto: `¿De cuál de tus hijos es la justificación? Escríbela con su nombre, por ejemplo: "${hijos[0].nombres.split(' ')[0]} no irá mañana por cita médica".` };
  const tutor = await env.DB.prepare(
    `SELECT u.id, u.nombre, u.telefono FROM profesor_secciones ps JOIN usuarios u ON u.id = ps.usuario_id
      WHERE u.colegio_id = ? AND ps.grado = ? AND ps.seccion = ? AND u.activo = 1 AND u.telefono IS NOT NULL LIMIT 1`,
  ).bind(colegio.id, hijo.grado, hijo.seccion).first();
  if (tutor) await avisarTutor(tutor, `📩 Justificación de ${persona.usuario.nombre} para *${hijo.nombres} ${hijo.apellidos}* (${hijo.grado} ${hijo.seccion}):\n"${texto}"`);
  await auditoria(env, colegio, persona, 'justificacion_whatsapp', 'alumno', hijo.id, { texto: texto.slice(0, 300) }).run();
  return {
    texto: `✅ Registramos la justificación de *${hijo.nombres}*${tutor ? ` y se la enviamos a su tutor(a) ${tutor.nombre.split(' (')[0]}` : ''}. ¡Que se mejore pronto si está enfermo(a)!`,
    porAtender: true, motivo: 'justificacion',
  };
}

async function misDatos(env, colegio, persona, hijos, origen) {
  const { results } = await env.DB.prepare(
    `SELECT alumno_id, finalidad, otorgado FROM consentimiento_vigente WHERE apoderado_id = ?`,
  ).bind(persona.apoderado.id).all();
  const estado = (h, f) => { const c = results.find((x) => x.alumno_id === h.id && x.finalidad === f); return c ? (c.otorgado ? '✅' : '❌') : '—'; };
  return `🔒 *Tus autorizaciones* (Ley 29733)\n` +
    hijos.map((h) => `*${h.nombres}*: WhatsApp ${estado(h, 'whatsapp')} · Salud ${estado(h, 'salud')} · Imagen ${estado(h, 'imagen')}`).join('\n') +
    `\n\nPara pedir una copia de tus datos, corregir o borrar algo, escribe *SOLICITUD* y lo que necesitas (por ejemplo: "solicitud corregir mi correo").` +
    (origen ? `\nAviso de privacidad: ${origen}/privacidad?c=${colegio.slug}` : '');
}

async function solicitudArco(env, colegio, persona, texto) {
  const t = texto.toLowerCase();
  const tipo = /borr|elimin|cancel/.test(t) ? 'cancelacion' : /corrig|cambi|actualiz|rectific/.test(t) ? 'rectificacion' : /no (quiero|deseo)|dejen|oposic/.test(t) ? 'oposicion' : 'acceso';
  await env.DB.prepare('INSERT INTO solicitudes_arco (colegio_id, apoderado_id, tipo, detalle) VALUES (?, ?, ?, ?)')
    .bind(colegio.id, persona.apoderado.id, tipo, `[Por WhatsApp] ${texto}`.slice(0, 2000)).run();
  return `📝 Registramos tu solicitud de *${tipo}*. Dirección te responderá dentro del plazo legal.`;
}

// "tutor Mía 987654321": registra el celular del hijo y su autorización (Ley 29733)
async function activarTutor(env, colegio, persona, hijos, texto) {
  const tel = normalizarTelefono((texto.match(/(\+?\d[\d\s-]{7,14}\d)/) || [])[1]);
  const hijo = hijos.length === 1 ? hijos[0] : hijos.find((h) => normalizarTexto(texto).includes(normalizarTexto(h.nombres.split(' ')[0])));
  if (!tel || !hijo) {
    return { texto: `🧠 *Tutor IA*: tu hijo(a) puede practicar por WhatsApp con un tutor que lo guía con preguntas y *no le da la respuesta*. Su profesor ve en qué temas necesita ayuda.\n\nPara activarlo escribe: *tutor ${hijos[0].nombres.split(' ')[0]} 9XXXXXXXX* (el celular de tu hijo).\n${FINALIDADES.tutor_ia.texto.replaceAll('{colegio}', colegio.nombre)}` };
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE alumnos SET telefono = ? WHERE id = ?').bind(tel, hijo.id),
    env.DB.prepare(`INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio) VALUES (?, ?, ?, 'tutor_ia', 1, ?, 'whatsapp')`)
      .bind(colegio.id, persona.apoderado.id, hijo.id, FINALIDADES.tutor_ia.version),
    auditoria(env, colegio, persona, 'activar_tutor_ia', 'alumno', hijo.id),
  ]);
  return { texto: `✅ Tutor IA activado para *${hijo.nombres}*. Dile que escriba "hola" a este mismo número desde su celular (+${tel}). Puedes desactivarlo escribiendo *BAJA TUTOR*.` };
}

const normalizarTexto = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Foto del voucher: la IA lee monto, medio y operación, sugiere la cuota y avisa a
// contabilidad para que lo confirme con un "SI" por WhatsApp.
export async function voucherPadre(env, colegio, persona, imagen, avisarContabilidad) {
  if (!hayIA(env)) return { texto: 'Recibimos tu foto 📸. Contabilidad la revisará.', porAtender: true };
  const hijos = await hijosDe(env, persona.apoderado.id);
  let v;
  try {
    v = await leerImagen(env, imagen,
      'Si la imagen es un comprobante de pago (Yape, Plin, transferencia, depósito, voucher), responde {"es_voucher":true,"monto":"450.00","medio":"yape|plin|transferencia|deposito|tarjeta","operacion":"número de operación","fecha":"AAAA-MM-DD"}. Si no, responde {"es_voucher":false}.',
      { json: true, maxTokens: 300 });
  } catch {
    return { texto: 'Recibimos tu foto 📸. No pude leerla bien; contabilidad la revisará.', porAtender: true };
  }
  if (!v.es_voucher) return { texto: 'Vi tu foto, pero no parece un comprobante de pago. Si es un voucher, mándalo un poco más nítido 🙏', porAtender: true };
  const monto = Math.round(Number(String(v.monto || '').replace(/[^\d.,]/g, '').replace(',', '.')) * 100) || null;
  const ids = hijos.map((h) => h.id);
  const cuota = ids.length ? await env.DB.prepare(
    `SELECT p.id, p.concepto, p.alumno_id, p.monto_centimos FROM pagos p WHERE p.alumno_id IN (${ids.map(() => '?').join(',')}) AND p.estado = 'pendiente'
      ORDER BY (p.monto_centimos = ?) DESC, p.vencimiento LIMIT 1`,
  ).bind(...ids, monto ?? -1).first() : null;
  const medio = ['yape', 'plin', 'transferencia', 'deposito', 'tarjeta'].includes(String(v.medio).toLowerCase()) ? String(v.medio).toLowerCase() : 'transferencia';
  const r = await env.DB.prepare(
    `INSERT INTO pagos_reportados (colegio_id, apoderado_id, alumno_id, pago_id, monto_centimos, medio, operacion, fecha) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(colegio.id, persona.apoderado.id, cuota?.alumno_id ?? null, cuota?.id ?? null, monto, medio, String(v.operacion || '').slice(0, 40), String(v.fecha || '').slice(0, 10)).first();
  const hijo = hijos.find((h) => h.id === cuota?.alumno_id);
  await avisarContabilidad(r.id, `🧾 Voucher #${r.id} de ${persona.usuario.nombre}${hijo ? ` (${hijo.nombres})` : ''}: ${monto ? soles(monto) : 'monto ilegible'} por ${medio}, op. ${v.operacion || '—'}.${cuota ? ` Cuota sugerida: ${cuota.concepto}.` : ''}\n¿Lo confirmo como pagado? Responde *SI* o *NO*.`, cuota ? { pago_id: cuota.id, medio, reportado_id: r.id } : null);
  return { texto: `✅ Recibí tu voucher${monto ? ` por ${soles(monto)}` : ''}${cuota ? ` para *${cuota.concepto}*` : ''}. Contabilidad lo validará y te llegará la constancia por aquí. ¡Gracias!` };
}

/** Responde a un padre. Devuelve { texto, porAtender?, motivo? } */
export async function responderPadre(env, colegio, persona, { intencion, consulta, texto, origen, avisarTutor }) {
  const hijos = await hijosDe(env, persona.apoderado.id);
  if (!hijos.length) return { texto: 'No encontramos alumnos matriculados asociados a tu número. Comunícate con secretaría.', porAtender: true };
  if (/^solicitud\b/i.test(texto)) return { texto: await solicitudArco(env, colegio, persona, texto) };
  const registrar = (accion) => auditoria(env, colegio, persona, accion, 'alumno', hijos[0].id, { hijos: hijos.map((h) => h.id) }).run();
  switch (intencion) {
    case 'deuda': await registrar('whatsapp_ver_pagos'); return { texto: await respuestaDeuda(env, hijos) };
    case 'utiles': return { texto: await respuestaUtiles(env, colegio, hijos) };
    case 'notas': await registrar('whatsapp_ver_notas'); return { texto: await respuestaNotas(env, hijos) };
    case 'como_va': await registrar('whatsapp_ver_notas'); return { texto: await respuestaCurso(env, colegio, hijos, consulta || texto) };
    case 'asistencia': await registrar('whatsapp_ver_asistencia'); return { texto: await respuestaAsistencia(env, hijos) };
    case 'como_pagar': return { texto: `${colegio.info_pago || 'Puedes pagar en la tesorería del colegio.'}${colegio.link_pago ? `\n\n💳 Paga con tarjeta o Yape aquí: ${colegio.link_pago}` : ''}\n\n📸 Después de pagar, mándame la foto del voucher y lo registramos.` };
    case 'tutor': return activarTutor(env, colegio, persona, hijos, texto);
    case 'justificar': return justificar(env, colegio, persona, hijos, consulta || texto, avisarTutor);
    case 'mis_datos': return { texto: await misDatos(env, colegio, persona, hijos, origen) };
    case 'humano': return { texto: 'Listo, una persona de secretaría te escribirá en horario de oficina (lun-vie 8:00 a 16:00).', porAtender: true };
    case 'gracias': return { texto: '¡Con gusto! 😊 Escribe *MENÚ* cuando necesites algo más.' };
    case 'menu': return { texto: menuPadre(persona, colegio) };
    default: return { texto: 'No entendí bien tu mensaje 🤔. Una persona de secretaría lo revisará.\n\n' + menuPadre(persona, colegio), porAtender: true };
  }
}
