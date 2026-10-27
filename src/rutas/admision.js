// Admisiones (interesados y visitas), información que responde el asistente y demo de 30 días.
import { json, cuerpo, falla, entero, hoyLima } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { sentenciaAuditoria } from '../lib/auditoria.js';
import { validarRuc } from '../lib/ruc.js';
import { CLAVES_INFO } from '../whatsapp/roles/admision.js';

const ESTADOS_LEAD = ['nuevo', 'contactado', 'matriculado', 'descartado'];
const ESTADOS_VISITA = ['agendada', 'realizada', 'cancelada'];

// Lo que se pide al colegio para la demo de 30 días: solo información pública, nunca datos de alumnos.
export const CHECKLIST_DEMO = [
  ['carta', 'Carta de aceptación por correo (una hoja)'], ['ruc', 'RUC y razón social'], ['contacto', 'Director/a y celular de contacto'],
  ['niveles', 'Niveles, grados y cantidad aproximada de familias'], ['pension', 'Pensiones y matrícula vigentes'], ['horarios', 'Horarios de ingreso, salida y atención'],
  ['calendario', 'Calendario de actividades del año'], ['utiles', 'Lista de útiles por grado'], ['pagos', 'Fechas y formas de pago'],
  ['requisitos', 'Requisitos de admisión y trámites'], ['visitas', 'Días y horas disponibles para visitas'], ['faq', '10 a 15 preguntas frecuentes con respuesta aprobada'],
];

export function rutasAdmision(r) {
  r.get('/api/admision', async (ctx, env) => {
    exigir(ctx, 'admision.ver');
    const [leads, visitas] = await env.DB.batch([
      env.DB.prepare('SELECT id, nombre, telefono, grado, origen, estado, creado_en FROM leads WHERE colegio_id = ? ORDER BY id DESC LIMIT 300').bind(ctx.colegioId),
      env.DB.prepare('SELECT v.id, v.lead_id, v.horario, v.estado, l.nombre, l.telefono, l.grado FROM visitas v JOIN leads l ON l.id = v.lead_id WHERE v.colegio_id = ? ORDER BY v.id DESC LIMIT 300').bind(ctx.colegioId),
    ]);
    return json({ leads: leads.results, visitas: visitas.results });
  });

  r.put('/api/admision/leads/:id', async (ctx, env) => {
    exigir(ctx, 'admision.editar');
    const d = await cuerpo(ctx.request, 500);
    if (!ESTADOS_LEAD.includes(d.estado)) throw falla(400, 'Estado inválido');
    const id = entero(ctx.params.id);
    const res = await env.DB.prepare('UPDATE leads SET estado = ? WHERE id = ? AND colegio_id = ?').bind(d.estado, id, ctx.colegioId).run();
    if (!res.meta.changes) throw falla(404, 'No encontrado');
    return json({ ok: true });
  });

  r.put('/api/admision/visitas/:id', async (ctx, env) => {
    exigir(ctx, 'admision.editar');
    const d = await cuerpo(ctx.request, 500);
    if (!ESTADOS_VISITA.includes(d.estado)) throw falla(400, 'Estado inválido');
    const id = entero(ctx.params.id);
    const res = await env.DB.prepare('UPDATE visitas SET estado = ? WHERE id = ? AND colegio_id = ?').bind(d.estado, id, ctx.colegioId).run();
    if (!res.meta.changes) throw falla(404, 'No encontrado');
    return json({ ok: true });
  });

  // ---- Información que responde el asistente ----
  r.get('/api/informes', async (ctx, env) => {
    exigir(ctx, 'informes.editar');
    const [info, faq] = await env.DB.batch([
      env.DB.prepare('SELECT clave, valor FROM info_colegio WHERE colegio_id = ?').bind(ctx.colegioId),
      env.DB.prepare('SELECT id, palabras, respuesta FROM faq WHERE colegio_id = ? ORDER BY id').bind(ctx.colegioId),
    ]);
    return json({ claves: CLAVES_INFO, info: Object.fromEntries(info.results.map((f) => [f.clave, f.valor])), faq: faq.results });
  });

  r.put('/api/informes', async (ctx, env) => {
    exigir(ctx, 'informes.editar');
    const d = await cuerpo(ctx.request, 60000);
    const sentencias = [];
    for (const clave of Object.keys(CLAVES_INFO)) {
      if (d.info?.[clave] === undefined) continue;
      sentencias.push(env.DB.prepare(
        `INSERT INTO info_colegio (colegio_id, clave, valor) VALUES (?, ?, ?)
         ON CONFLICT(colegio_id, clave) DO UPDATE SET valor = excluded.valor, actualizado_en = datetime('now')`,
      ).bind(ctx.colegioId, clave, String(d.info[clave]).slice(0, 3000)));
    }
    if (d.admision_activa !== undefined) {
      sentencias.push(env.DB.prepare(
        `INSERT INTO info_colegio (colegio_id, clave, valor) VALUES (?, 'admision_activa', ?)
         ON CONFLICT(colegio_id, clave) DO UPDATE SET valor = excluded.valor`,
      ).bind(ctx.colegioId, d.admision_activa ? '1' : '0'));
    }
    if (Array.isArray(d.faq)) {
      const faq = d.faq.map((f) => ({ palabras: String(f.palabras || '').trim().slice(0, 120), respuesta: String(f.respuesta || '').trim().slice(0, 1000) }))
        .filter((f) => f.palabras && f.respuesta).slice(0, 60);
      sentencias.push(env.DB.prepare('DELETE FROM faq WHERE colegio_id = ?').bind(ctx.colegioId));
      for (const f of faq) sentencias.push(env.DB.prepare('INSERT INTO faq (colegio_id, palabras, respuesta) VALUES (?, ?, ?)').bind(ctx.colegioId, f.palabras, f.respuesta));
    }
    sentencias.push(sentenciaAuditoria(env, ctx, 'editar_informes', 'colegio', ctx.colegioId, {}));
    await env.DB.batch(sentencias);
    return json({ ok: true });
  });

  // ---- Demo de 30 días ----
  r.get('/api/demo', async (ctx, env) => {
    exigir(ctx, 'informes.editar');
    const c = await env.DB.prepare('SELECT ruc, demo_inicio, demo_checklist FROM colegios WHERE id = ?').bind(ctx.colegioId).first();
    const inicio = c.demo_inicio || null;
    const dias = inicio ? Math.max(0, 30 - Math.floor((Date.parse(hoyLima()) - Date.parse(inicio)) / 864e5)) : null;
    return json({ ruc: c.ruc, inicio, dias_restantes: dias, checklist: JSON.parse(c.demo_checklist || '{}'), pasos: CHECKLIST_DEMO.map(([clave, texto]) => ({ clave, texto })) });
  });

  r.put('/api/demo', async (ctx, env) => {
    exigir(ctx, 'informes.editar');
    const d = await cuerpo(ctx.request, 3000);
    if (d.ruc !== undefined && d.ruc !== '') {
      const error = validarRuc(d.ruc);
      if (error) throw falla(400, error);
    }
    const inicio = d.inicio && /^\d{4}-\d{2}-\d{2}$/.test(d.inicio) ? d.inicio : null;
    const marcas = Object.fromEntries(CHECKLIST_DEMO.map(([k]) => [k, d.checklist?.[k] ? 1 : 0]));
    await env.DB.batch([
      env.DB.prepare('UPDATE colegios SET ruc = COALESCE(NULLIF(?, \'\'), ruc), demo_inicio = COALESCE(?, demo_inicio), demo_checklist = ? WHERE id = ?')
        .bind(String(d.ruc ?? ''), inicio, JSON.stringify(marcas), ctx.colegioId),
      sentenciaAuditoria(env, ctx, 'editar_demo', 'colegio', ctx.colegioId, {}),
    ]);
    return json({ ok: true });
  });
}
