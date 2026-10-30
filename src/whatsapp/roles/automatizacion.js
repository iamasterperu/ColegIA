// Lo nuevo por WhatsApp: aprobar comunicados, tomar lista, constancias y diplomas, invitar a
// familias interesadas, reinscripción, reportes y comprobantes. Devuelve null si el mensaje
// no es de este grupo para que siga el flujo normal.
import { hoyLima, soles } from '../../lib/http.js';
import { tiene } from '../../lib/permisos.js';
import { normalizar } from '../../lib/texto.js';
import { sentenciasAsistencia, sentenciaLista } from '../../lib/asistencia.js';
import { guardarPieza, enlacePieza, fechaLarga } from '../../lib/plantillas.js';
import { emitirPago, configurado } from '../../lib/nubefact.js';
import { validarRuc } from '../../lib/ruc.js';
import { auditoria, encolar } from '../comun.js';
import { decidirBorrador, cumpleHoy, construirReporte, nombreMes } from '../automatizacion.js';
import { iniciarReinscripcion, estadoReinscripcion } from '../reinscripcion.js';
import { resolverAlumno, gradoEn } from './personal.js';

const origen = (env) => env.URL_BASE || '';
const confirmar = (tipo, datos, texto) => ({ texto, pendiente: { accion: 'confirmar', datos: { tipo, ...datos } } });
const fmt = (iso) => iso.split('-').reverse().slice(0, 2).join('/');
const aprobador = (persona) => tiene(persona.usuario, 'comunicados.aprobar');

// ---------- Toma de lista ----------
async function seccionesDe(env, colegio, persona) {
  if (persona.rol === 'profesor') {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT ps.grado, ps.seccion FROM profesor_secciones ps WHERE ps.usuario_id = ? ORDER BY ps.grado, ps.seccion`,
    ).bind(persona.usuario.id).all();
    return results;
  }
  const { results } = await env.DB.prepare("SELECT DISTINCT grado, seccion FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado' ORDER BY grado, seccion").bind(colegio.id).all();
  return results;
}

async function empezarLista(env, colegio, grado, seccion) {
  const { results } = await env.DB.prepare(
    "SELECT id, nombres, apellidos FROM alumnos WHERE colegio_id = ? AND grado = ? AND seccion = ? AND estado = 'matriculado' ORDER BY apellidos, nombres",
  ).bind(colegio.id, grado, seccion).all();
  if (!results.length) return { texto: `No hay alumnos matriculados en ${grado} ${seccion}.` };
  const hecha = await env.DB.prepare('SELECT 1 FROM asistencia_listas WHERE colegio_id = ? AND grado = ? AND seccion = ? AND fecha = ?').bind(colegio.id, grado, seccion, hoyLima()).first();
  return {
    texto: `🗓️ *Lista de ${grado} ${seccion}* (${fmt(hoyLima())})${hecha ? '\n⚠️ Ya se tomó lista hoy; si continúas, se corrige.' : ''}\n` +
      results.map((a, i) => `${i + 1}. ${a.apellidos} ${a.nombres}`).join('\n') +
      '\n\nResponde con los *números de quienes faltaron* y, después de la palabra *tarde*, de quienes llegaron tarde. Ejemplo: *faltan 3 7 tarde 12*. Si todos vinieron, escribe *todos*.',
    pendiente: { accion: 'lista', datos: { paso: 'marcar', grado, seccion, ids: results.map((a) => a.id), nombres: results.map((a) => `${a.nombres} ${a.apellidos}`) } },
  };
}

async function lista(env, colegio, persona, consulta) {
  if (!tiene(persona.usuario, 'asistencia.tomar')) return { texto: 'Tu rol no toma lista.' };
  let secciones = await seccionesDe(env, colegio, persona);
  if (!secciones.length) return { texto: persona.rol === 'profesor' ? 'No tienes secciones asignadas. Pídele a dirección que te las asigne.' : 'No hay alumnos matriculados.' };
  if (consulta) {
    const grado = await gradoEn(env, colegio, consulta);
    const letra = normalizar(consulta).match(/\b([a-e])\b\s*$/)?.[1]?.toUpperCase();
    const filtradas = secciones.filter((s) => (!grado || s.grado === grado) && (!letra || s.seccion === letra));
    if (filtradas.length) secciones = filtradas;
  }
  if (secciones.length === 1) return empezarLista(env, colegio, secciones[0].grado, secciones[0].seccion);
  return {
    texto: '¿De qué sección tomas lista? Responde con el número:\n' + secciones.map((s, i) => `${i + 1}) ${s.grado} ${s.seccion}`).join('\n'),
    pendiente: { accion: 'lista', datos: { paso: 'elegir', secciones } },
  };
}

// Respuesta a una lista en curso. Devuelve null si el mensaje es otra cosa.
export async function continuarLista(env, colegio, persona, datos, texto) {
  const t = normalizar(texto);
  if (/^(cancelar|cancela|salir|no)$/.test(t)) return { texto: 'Listo, cancelé la lista.', terminar: true };
  if (datos.paso === 'elegir') {
    const s = datos.secciones[Number(t) - 1];
    return s ? empezarLista(env, colegio, s.grado, s.seccion) : null;
  }
  if (!/^\d|todos|ninguno|nadie|falt|tard|sin falt/.test(t)) return null;
  const faltas = [];
  const tardanzas = [];
  if (!/^(todos|ninguno|nadie|sin falt)/.test(t)) {
    const [antes, despues = ''] = t.split(/\btard\w*/);
    const nums = (s) => [...new Set((s.match(/\d+/g) || []).map(Number))];
    for (const [lista, n] of [[faltas, nums(antes)], [tardanzas, nums(despues)]]) {
      for (const k of n) if (k >= 1 && k <= datos.ids.length) lista.push(k - 1);
    }
    if (!faltas.length && !tardanzas.length) return { texto: 'No entendí los números. Ejemplo: *faltan 3 7 tarde 12*. Si todos vinieron, escribe *todos*.', pendiente: { accion: 'lista', datos } };
  }
  const nombre = (i) => datos.nombres[i];
  const presentes = datos.ids.length - faltas.length - tardanzas.length;
  return confirmar('lista', { grado: datos.grado, seccion: datos.seccion, ids: datos.ids, faltas: faltas.map((i) => datos.ids[i]), tardanzas: tardanzas.map((i) => datos.ids[i]), fecha: hoyLima() },
    `📋 *${datos.grado} ${datos.seccion}* (${fmt(hoyLima())})\n✅ Presentes: ${presentes}\n` +
    (faltas.length ? `❌ Faltaron: ${faltas.map(nombre).join(', ')}\n` : '') + (tardanzas.length ? `⏰ Tarde: ${tardanzas.map(nombre).join(', ')}\n` : '') +
    '\n¿Guardo la lista y aviso a los apoderados de los ausentes? Responde *SI* o *NO*.');
}

async function ejecutarLista(env, colegio, persona, d, notificar) {
  const u = persona.usuario;
  if (!tiene(u, 'asistencia.tomar')) return 'Tu rol no toma lista.';
  if (u.rol === 'profesor') {
    const ok = await env.DB.prepare('SELECT 1 FROM profesor_secciones WHERE usuario_id = ? AND grado = ? AND seccion = ?').bind(u.id, d.grado, d.seccion).first();
    if (!ok) return 'Esa sección no es tuya.';
  }
  // Solo alumnos de esa sección (el servidor no confía en los ids que vienen del chat)
  const { results } = await env.DB.prepare(
    `SELECT id, nombres FROM alumnos WHERE colegio_id = ? AND grado = ? AND seccion = ? AND estado = 'matriculado' AND id IN (${d.ids.map(() => '?').join(',')})`,
  ).bind(colegio.id, d.grado, d.seccion, ...d.ids).all();
  const nombres = new Map(results.map((r) => [r.id, r.nombres]));
  const registros = results.map((a) => ({ alumnoId: a.id, estado: d.faltas.includes(a.id) ? 'falta' : d.tardanzas.includes(a.id) ? 'tardanza' : 'presente' }));
  await env.DB.batch([
    ...(await sentenciasAsistencia(env, colegio.id, d.fecha, registros, u.id)),
    sentenciaLista(env, colegio.id, d.grado, d.seccion, d.fecha, u.id),
    auditoria(env, colegio, persona, 'tomar_lista', null, null, { grado: d.grado, seccion: d.seccion, faltas: d.faltas.length, tardanzas: d.tardanzas.length }),
  ]);
  let avisados = 0;
  for (const r of registros.filter((x) => x.estado !== 'presente').slice(0, 25)) {
    const ap = await env.DB.prepare(
      `SELECT ap.id, ap.nombres, ap.telefono FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id
        WHERE aa.alumno_id = ? AND ap.telefono IS NOT NULL
          AND (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ap.id AND c.alumno_id = aa.alumno_id AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) = 1
        ORDER BY aa.responsable_pago DESC LIMIT 1`,
    ).bind(r.alumnoId).first();
    if (!ap) continue;
    await notificar(ap, `📋 Hoy registramos ${r.estado === 'falta' ? 'una falta' : 'una tardanza'} de ${nombres.get(r.alumnoId)}. Si fue por un motivo justificado, cuéntanos por aquí.`);
    avisados++;
  }
  return `✅ Lista de ${d.grado} ${d.seccion} guardada: ${registros.length - d.faltas.length - d.tardanzas.length} presentes, ${d.faltas.length} falta(s), ${d.tardanzas.length} tardanza(s). Avisé a ${avisados} apoderado(s). Dirección la verá en el reporte del día.`;
}

// ---------- Constancia y diploma (borrador para firma) ----------
async function constancia(env, colegio, persona, e) {
  if (!tiene(persona.usuario, 'alumnos.editar')) return { texto: 'Solo secretaría y dirección preparan constancias.' };
  const r = await resolverAlumno(env, colegio, persona, e.consulta.replace(/^(de matricula|de|para)\s+/i, ''), 'constancia', {}, e.alumnoId);
  if (!r.alumno) return r.respuesta;
  const a = r.alumno;
  const hoy = hoyLima();
  const texto = `La Dirección de ${colegio.nombre}${colegio.ruc ? ` (RUC ${colegio.ruc})` : ''} HACE CONSTAR que ${a.nombres} ${a.apellidos}${a.dni ? `, con DNI ${a.dni}` : `, con código ${a.codigo}`}, se encuentra matriculado(a) en ${a.grado} sección ${a.seccion} de ${a.nivel} durante el año escolar ${colegio.anio_escolar}.`;
  const { token } = await guardarPieza(env, colegio.id, 'constancia', 'Constancia de matrícula', {
    titulo: 'CONSTANCIA DE MATRÍCULA', fecha: hoy,
    texto: `${texto}\n \nSe expide la presente a solicitud de la parte interesada, para los fines que estime conveniente.\n \n${colegio.direccion ? `${colegio.direccion.split(',').pop().trim()}, ` : ''}${fechaLarga(hoy)}`,
    firma: '\n\n\n______________________________\nDirección',
  }, persona.usuario.id);
  await auditoria(env, colegio, persona, 'crear_constancia', 'alumno', a.id).run();
  return { texto: `📄 Borrador de *constancia de matrícula* de ${a.nombres} ${a.apellidos}, con el diseño del colegio. Revísalo y pásalo a firma del director:\n${origen(env)}/c/${token}/pdf` };
}

async function diploma(env, colegio, persona, e) {
  if (!tiene(persona.usuario, 'alumnos.editar')) return { texto: 'Solo secretaría y dirección preparan diplomas.' };
  const [quien, ...motivo] = e.consulta.split(':');
  const r = await resolverAlumno(env, colegio, persona, quien.replace(/^(a|para|de)\s+/i, ''), 'diploma', { motivo: motivo.join(':') || e.extra?.motivo }, e.alumnoId);
  if (!r.alumno) return r.respuesta;
  const a = r.alumno;
  const razon = (motivo.join(':').trim() || e.extra?.motivo || '').slice(0, 200) || 'Por su esfuerzo, dedicación y buen desempeño durante el año escolar.';
  const { token } = await guardarPieza(env, colegio.id, 'diploma', 'Diploma de reconocimiento', { nombre: `${a.nombres} ${a.apellidos}`, motivo: razon, fecha: hoyLima(), firma: 'Dirección' }, persona.usuario.id);
  await auditoria(env, colegio, persona, 'crear_diploma', 'alumno', a.id).run();
  return { texto: `🏅 Diploma para ${a.nombres} ${a.apellidos}, listo para imprimir:\n${origen(env)}/c/${token}/pdf` };
}

// ---------- Comprobantes electrónicos ----------
async function comprobante(env, colegio, persona, e, texto) {
  if (!tiene(persona.usuario, 'comprobantes.emitir')) return { texto: 'Tu rol no emite comprobantes.' };
  if (!configurado(colegio)) return { texto: 'Aún no está conectado el proveedor de facturación (Nubefact). Se configura una sola vez en Ajustes con la RUTA, el TOKEN y la serie del colegio. Nunca se pide la clave SOL.' };
  const factura = /\bfactura\b/.test(normalizar(texto));
  const ruc = texto.match(/\b(\d{11})\b/)?.[1];
  const razon = ruc ? texto.slice(texto.indexOf(ruc) + 11).replace(/^[\s:,-]+/, '').trim() : '';
  let consulta = e.consulta.replace(/\b\d{11}\b.*$/, '').replace(/^(de|para|a)\s+/i, '').trim();
  const r = await resolverAlumno(env, colegio, persona, consulta, 'comprobante', {}, e.alumnoId);
  if (!r.alumno) return r.respuesta;
  const p = await env.DB.prepare(
    `SELECT p.* FROM pagos p WHERE p.alumno_id = ? AND p.estado = 'pagado' AND NOT EXISTS (SELECT 1 FROM comprobantes c WHERE c.pago_id = p.id AND c.estado = 'emitido')
      ORDER BY p.pagado_en DESC, p.id DESC LIMIT 1`,
  ).bind(r.alumno.id).first();
  if (!p) return { texto: `${r.alumno.nombres} no tiene pagos registrados sin comprobante. Primero registra el pago.` };
  if (factura) {
    const error = validarRuc(ruc || '');
    if (error) return { texto: `Para la factura escribe el RUC y la razón social: *factura ${r.alumno.nombres} 20123456789 Razón Social SAC*. ${ruc ? error : ''}` };
    if (!razon) return { texto: 'Falta la razón social. Ejemplo: *factura Mateo Quispe 20123456789 Inversiones Perú SAC*.' };
  }
  return confirmar('comprobante', { pago_id: p.id, tipo: factura ? 'factura' : 'boleta', ruc: factura ? ruc : null, razon: factura ? razon : null },
    `Emitiré una *${factura ? 'factura' : 'boleta'}* electrónica por ${soles(p.monto_centimos)} (${p.concepto}) de ${r.alumno.nombres} ${r.alumno.apellidos}${factura ? ` a nombre de ${razon} (RUC ${ruc})` : ''}. ¿La emito? Responde *SI* o *NO*.`);
}

async function ejecutarComprobante(env, colegio, persona, d, notificar) {
  if (!tiene(persona.usuario, 'comprobantes.emitir')) return 'Tu rol no emite comprobantes.';
  try {
    const r = await emitirPago(env, colegio, d.pago_id, { tipo: d.tipo, ruc: d.ruc, razon: d.razon, usuarioId: persona.usuario.id });
    await auditoria(env, colegio, persona, 'emitir_comprobante', 'alumno', r.alumno_id, { tipo: d.tipo, serie: r.serie, numero: r.numero }).run();
    let aviso = '';
    const ap = r.apoderado;
    if (ap?.telefono && r.enlace_pdf && d.tipo === 'boleta') {
      const ok = await env.DB.prepare("SELECT (SELECT otorgado FROM consentimientos c WHERE c.apoderado_id = ? AND c.alumno_id = ? AND c.finalidad = 'whatsapp' ORDER BY c.id DESC LIMIT 1) AS o")
        .bind(ap.id, r.alumno_id).first();
      if (ok?.o === 1) { await notificar(ap, `📄 Le enviamos la boleta electrónica ${r.serie}-${r.numero} por ${r.total}: ${r.enlace_pdf}`); aviso = ` y se la envié a ${ap.nombres}`; }
    }
    return `✅ ${d.tipo === 'factura' ? 'Factura' : 'Boleta'} ${r.serie}-${r.numero} emitida${aviso}.${r.enlace_pdf ? `\n${r.enlace_pdf}` : ''}`;
  } catch (e) {
    return `⚠️ No se pudo emitir: ${e.message}`;
  }
}

// ---------- Invitación a familias interesadas ----------
export const urlCarta = (env, colegio) => `${origen(env)}/carta/${colegio.slug}`;

async function invitar(env, colegio) {
  const { results } = await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE colegio_id = ? AND estado IN ('nuevo', 'contactado')").bind(colegio.id).all();
  const n = results[0].n;
  if (!n) return { texto: 'No hay familias interesadas pendientes de invitar.' };
  return confirmar('invitar', {}, `Enviaré a *${n} familias interesadas* una invitación a conocer ${colegio.nombre}, con la carta de presentación del colegio (la armo con tu información) y cómo agendar su visita:\n${urlCarta(env, colegio)}\n\n¿La envío? Responde *SI* o *NO*.`);
}

async function ejecutarInvitar(env, colegio, persona) {
  const { results } = await env.DB.prepare("SELECT id, nombre, telefono FROM leads WHERE colegio_id = ? AND estado IN ('nuevo', 'contactado') LIMIT 200").bind(colegio.id).all();
  const n = await encolar(env, colegio, results.map((l) => ({ telefono: l.telefono, nombres: l.nombre })),
    `gracias por su interés en ${colegio.nombre} 💙 Le dejamos nuestra carta de presentación con todo lo que nos hace especiales: ${urlCarta(env, colegio)}\nSerá un gusto recibirlos. Para agendar su visita, escriba *VISITA* por aquí.`, 'invitacion', persona.usuario.id, `invitacion-${hoyLima()}`);
  if (results.length) await env.DB.batch(results.map((l) => env.DB.prepare("UPDATE leads SET estado = 'contactado' WHERE id = ? AND estado = 'nuevo'").bind(l.id)));
  await auditoria(env, colegio, persona, 'invitar_familias', null, null, { destinatarios: n }).run();
  return { texto: `✅ Invitación en camino a ${n} familias interesadas.`, enviarCola: true };
}

// ---------- Punto de entrada ----------
export async function responderAutomatizacion(env, colegio, persona, e) {
  const u = persona.usuario;
  switch (e.intencion) {
    case 'lista': return lista(env, colegio, persona, e.consulta || '');
    case 'borradores': {
      if (!aprobador(persona)) return null;
      const { results } = await env.DB.prepare("SELECT id, titulo, fecha, texto FROM borradores WHERE colegio_id = ? AND estado = 'pendiente' ORDER BY fecha").bind(colegio.id).all();
      return { texto: results.length ? '📝 *Comunicados por aprobar*\n' + results.map((b) => `${b.id}) ${b.titulo} (${fmt(b.fecha)}): "${b.texto.slice(0, 110)}…"`).join('\n') + '\n\nResponde *APROBAR número*, *RECHAZAR número* o *EDITAR número: texto*.' : 'No hay comunicados por aprobar.' };
    }
    case 'aprobar': case 'rechazar': case 'editar_borrador': {
      if (!aprobador(persona)) return null;
      const id = Number(e.texto.match(/\d+/)?.[0]);
      if (!id) return { texto: 'Dime el número del comunicado. Ejemplo: *APROBAR 12*.' };
      const accion = e.intencion === 'editar_borrador' ? 'editar' : e.intencion;
      const r = await decidirBorrador(env, colegio, id, accion, u, e.texto.replace(/^\s*editar\s+\d+\s*:?\s*/i, ''));
      return { texto: r.texto, enviarCola: r.enviarCola };
    }
    case 'cumples': {
      const lista = await cumpleHoy(env, colegio.id);
      return { texto: lista.length ? `🎂 *Cumplen años hoy*\n${lista.map((x) => `• ${x.nombre} (${x.tipo}${x.detalle ? `, ${x.detalle}` : ''})`).join('\n')}` : 'Hoy no cumple años nadie registrado.' };
    }
    case 'reporte': {
      if (!tiene(u, 'reportes.ver')) return null;
      const mes = hoyLima().slice(0, 7);
      const secciones = await construirReporte(env, colegio, mes);
      const { token } = await guardarPieza(env, colegio.id, 'reporte', `Reporte de ${nombreMes(mes)}`, { titulo: `Reporte de ${nombreMes(mes)} (hasta hoy)`, fecha: hoyLima(), secciones, firma: `Generado por ColegIA para ${colegio.nombre}` }, u.id);
      return { texto: `📊 *Reporte de ${nombreMes(mes)} (hasta hoy)*\n${secciones.slice(0, 3).map((s) => `\n*${s.titulo}*\n${s.lineas.slice(0, 3).join('\n')}`).join('\n')}\n\nCompleto: ${origen(env)}/c/${token}\nEl reporte final llega solo el último día del mes.` };
    }
    case 'invitar': return tiene(u, 'admision.editar') ? invitar(env, colegio) : null;
    case 'reinscripcion': {
      if (!tiene(u, 'reinscripcion.gestionar')) return null;
      if (/\b(iniciar|empezar|comenzar|lanzar)\b/.test(normalizar(e.texto))) {
        const anio = colegio.anio_escolar + 1;
        const { results } = await env.DB.prepare("SELECT COUNT(*) n FROM alumnos WHERE colegio_id = ? AND estado = 'matriculado'").bind(colegio.id).all();
        return confirmar('reinscripcion', {}, `Preguntaré a las familias de *${results[0].n} alumnos* si continuarán en ${colegio.nombre} el año ${anio} (solo a quienes autorizaron WhatsApp). Responderán *REINSCRIBIR* o *NO CONTINUARÉ*, y a los que no respondan se les recordará. ¿Inicio la campaña? Responde *SI* o *NO*.`);
      }
      return { texto: await estadoReinscripcion(env, colegio) };
    }
    case 'constancia': return constancia(env, colegio, persona, e);
    case 'diploma': return diploma(env, colegio, persona, e);
    case 'comprobante': return comprobante(env, colegio, persona, e, e.texto);
  }
  return null;
}

// Acciones confirmadas con SI que pertenecen a este grupo. Devuelve null si no es de aquí.
export async function ejecutarAutomatizada(env, colegio, persona, datos, ctx) {
  if (datos.tipo === 'lista') return ejecutarLista(env, colegio, persona, datos, ctx.notificar);
  if (datos.tipo === 'comprobante') return ejecutarComprobante(env, colegio, persona, datos, ctx.notificar);
  if (datos.tipo === 'invitar') { const r = await ejecutarInvitar(env, colegio, persona); ctx.enviarCola?.(30); return r.texto; }
  if (datos.tipo === 'reinscripcion') {
    if (!tiene(persona.usuario, 'reinscripcion.gestionar')) return 'Tu rol no inicia la reinscripción.';
    const n = await iniciarReinscripcion(env, colegio, persona.usuario);
    ctx.enviarCola?.(30);
    return `✅ Campaña de reinscripción ${colegio.anio_escolar + 1} iniciada: ${n.enviados} familias recibirán la pregunta${n.sinPermiso ? ` (${n.sinPermiso} alumnos sin autorización de WhatsApp: secretaría debe consultarles aparte)` : ''}.`;
  }
  return null;
}

// ---------- "mi cumpleaños 12 de mayo": cada persona registra su fecha (sin año) ----------
const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
export function fechaDeCumple(texto) {
  const t = normalizar(texto);
  let d; let m;
  const a = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]+)\b/);
  const b = String(texto).match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?\b/);
  if (b) { d = Number(b[1]); m = Number(b[2]); } else if (a && MES[a[2]]) { d = Number(a[1]); m = MES[a[2]]; }
  if (!d || !m || m < 1 || m > 12 || d < 1 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) return null;
  const anio = t.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || '1900'; // sin año: solo importan día y mes
  return `${anio}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function registrarMiCumple(env, colegio, persona, texto) {
  const t = normalizar(texto);
  if (!/^(mi cumpleanos|mi cumple|cumpleanos)\b/.test(t)) return null;
  const f = fechaDeCumple(String(texto).replace(/^\s*(mi cumplea[nñ]os|mi cumple|cumplea[nñ]os)\s*(es)?\s*(el)?\s*/i, ''));
  if (!f) return 'Escríbelo así: *mi cumpleaños 12 de mayo*.';
  const hoy = persona.rol === 'padre'
    ? await env.DB.prepare('UPDATE apoderados SET fecha_nacimiento = ? WHERE id = ? AND colegio_id = ?').bind(f, persona.apoderado.id, colegio.id).run()
    : await env.DB.prepare('UPDATE usuarios SET fecha_nacimiento = ? WHERE id = ? AND colegio_id = ?').bind(f, persona.usuario.id, colegio.id).run();
  if (!hoy.meta.changes) return null;
  const [, m, d] = f.split('-').map(Number);
  return `🎂 ¡Anotado! Te saludaremos el ${d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]}.`;
}
