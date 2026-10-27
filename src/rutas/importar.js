// Importación desde Excel. El archivo se lee en el navegador (src: public/js/xlsx.js) y
// llega aquí en bloques de hasta 90 filas ya convertidas a JSON: así cada solicitud usa
// muy poca CPU y entra en el límite de 10 ms del plan gratis.
import { json, cuerpo, falla } from '../lib/http.js';
import { exigir } from '../lib/sesion.js';
import { auditar, sentenciaAuditoria } from '../lib/auditoria.js';
import { nombreBusqueda, normalizarTelefono, normalizar } from '../lib/texto.js';
import { validarAlumno } from './alumnos.js';
import { FINALIDADES } from '../lib/consentimiento.js';
import { parseSecciones } from './admin.js';

const MAX_FILAS = 90; // D1 admite hasta 100 parámetros por consulta

const t = (v, n) => String(v ?? '').trim().slice(0, n);
const siNo = (v) => ['si', 's', 'x', '1', 'true', 'autoriza'].includes(normalizar(v));

function filasDe(d) {
  const filas = Array.isArray(d.filas) ? d.filas : [];
  if (!filas.length) throw falla(400, 'No llegaron filas');
  if (filas.length > MAX_FILAS) throw falla(413, `Máximo ${MAX_FILAS} filas por envío`);
  return filas;
}

const ROL_CARGO = [
  [/direct|subdirect|coordinador|promotor/, 'direccion'],
  [/secretar|administrativ|recepci/, 'secretaria'],
  [/contab|contador|tesorer|caja|cobranza/, 'contabilidad'],
  [/profe|docente|tutor|maestr|auxiliar/, 'profesor'],
];
const rolDe = (v) => ROL_CARGO.find(([re]) => re.test(normalizar(v)))?.[1] || null;

export function rutasImportar(r) {
  r.post('/api/importar/alumnos', async (ctx, env) => {
    exigir(ctx, 'importar.alumnos');
    return json(await importarAlumnos(env, ctx, filasDe(await cuerpo(ctx.request, 200_000))));
  });
  // Personal (directora, profesores, secretaría, contabilidad). Lo que importa para WhatsApp es el
  // celular: con él el agente sabe quién es y qué menú darle. Se crean sin contraseña web
  // (hashear 90 contraseñas no entra en 10 ms de CPU); dirección se la asigna a quien la necesite.
  r.post('/api/importar/personal', async (ctx, env) => {
    exigir(ctx, 'usuarios.gestionar');
    const filas = filasDe(await cuerpo(ctx.request, 200_000));
    const { results: existentes } = await env.DB.prepare('SELECT id, email, telefono FROM usuarios WHERE colegio_id = ?').bind(ctx.colegioId).all();
    const porTel = new Map(existentes.filter((u) => u.telefono).map((u) => [u.telefono, u]));
    const porEmail = new Map(existentes.map((u) => [u.email, u]));
    const slug = (await env.DB.prepare('SELECT slug FROM colegios WHERE id = ?').bind(ctx.colegioId).first()).slug;
    const errores = [];
    const vistos = new Set();
    let creados = 0;
    let actualizados = 0;
    for (const [i, f] of filas.entries()) {
      const fila = f._fila ?? i + 2;
      const nombre = t(f.nombre, 80);
      const rol = rolDe(f.rol);
      const telefono = normalizarTelefono(f.telefono);
      if (!nombre) { errores.push({ fila, error: 'Falta el nombre' }); continue; }
      if (!rol) { errores.push({ fila, error: `Cargo no reconocido: "${t(f.rol, 30)}". Usa profesor, secretaria, contabilidad o direccion` }); continue; }
      if (!telefono) { errores.push({ fila, error: 'Falta el celular o no es válido (sin él no puede usar WhatsApp)' }); continue; }
      if (vistos.has(telefono)) { errores.push({ fila, error: 'Celular repetido en el archivo' }); continue; }
      vistos.add(telefono);
      let email = t(f.email, 120).toLowerCase();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { errores.push({ fila, error: 'Correo inválido' }); continue; }
      const previo = porTel.get(telefono) || (email && porEmail.get(email));
      const lotes = [];
      let id;
      if (previo) {
        id = previo.id;
        // Quien importa no puede quitarse a sí mismo el rol de dirección por un error del Excel
        const rolFinal = id === ctx.usuario.id ? ctx.usuario.rol : rol;
        lotes.push(env.DB.prepare('UPDATE usuarios SET nombre = ?, rol = ?, telefono = ?, activo = 1 WHERE id = ?').bind(nombre, rolFinal, telefono, id));
        actualizados++;
      } else {
        // Sin correo se arma uno interno: solo sirve como identificador, no recibe mensajes
        email ||= `${normalizar(nombre).split(' ').slice(0, 2).join('.')}.${telefono.slice(-4)}@${slug}.colegia`;
        if (porEmail.has(email)) { errores.push({ fila, error: `El correo ${email} ya es de otro usuario` }); continue; }
        const r = await env.DB.prepare(
          "INSERT INTO usuarios (colegio_id, nombre, email, rol, clave, telefono) VALUES (?, ?, ?, ?, 'sin-clave-web', ?) RETURNING id",
        ).bind(ctx.colegioId, nombre, email, rol, telefono).first();
        id = r.id;
        porEmail.set(email, { id });
        creados++;
      }
      if (rol === 'profesor' && f.secciones) {
        lotes.push(env.DB.prepare('DELETE FROM profesor_secciones WHERE usuario_id = ?').bind(id));
        for (const s of parseSecciones(f.secciones)) {
          lotes.push(env.DB.prepare('INSERT OR IGNORE INTO profesor_secciones (usuario_id, grado, seccion) VALUES (?, ?, ?)').bind(id, s.grado, s.seccion));
        }
      }
      if (lotes.length) await env.DB.batch(lotes);
    }
    await env.DB.batch([sentenciaAuditoria(env, ctx, 'importar_personal', null, null, { creados, actualizados, errores: errores.length })]);
    return json({ creados: creados + actualizados, nuevos: creados, actualizados, errores });
  });

  r.post('/api/importar/pagos', async (ctx, env) => {
    exigir(ctx, 'importar.pagos');
    const filas = filasDe(await cuerpo(ctx.request, 200_000));
    const codigos = [...new Set(filas.map((f) => t(f.codigo, 30)).filter(Boolean))];
    const { results } = codigos.length
      ? await env.DB.prepare(`SELECT id, codigo FROM alumnos WHERE colegio_id = ? AND codigo IN (${codigos.map(() => '?').join(',')})`)
        .bind(ctx.colegioId, ...codigos).all()
      : { results: [] };
    const porCodigo = new Map(results.map((a) => [a.codigo, a.id]));
    const errores = [];
    const sentencias = [];
    filas.forEach((f, i) => {
      const fila = f._fila ?? i + 2;
      const alumnoId = porCodigo.get(t(f.codigo, 30));
      const monto = Math.round(Number(String(f.monto ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) * 100);
      const venc = t(f.vencimiento, 10);
      const concepto = t(f.concepto, 80);
      if (!alumnoId) return errores.push({ fila, error: `No existe un alumno con código "${f.codigo}"` });
      if (!concepto || !Number.isFinite(monto) || monto <= 0) return errores.push({ fila, error: 'Falta concepto o monto' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return errores.push({ fila, error: 'Vencimiento debe ser una fecha' });
      const pagado = normalizar(f.estado).startsWith('pag');
      const fechaPago = /^\d{4}-\d{2}-\d{2}$/.test(t(f.fecha_pago, 10)) ? t(f.fecha_pago, 10) : pagado ? venc : null;
      sentencias.push(env.DB.prepare(
        `INSERT INTO pagos (colegio_id, alumno_id, concepto, periodo, monto_centimos, vencimiento, estado, pagado_en, registrado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(alumno_id, concepto) DO UPDATE SET monto_centimos = excluded.monto_centimos,
           vencimiento = excluded.vencimiento, periodo = excluded.periodo,
           estado = CASE WHEN excluded.estado = 'pagado' THEN 'pagado' ELSE estado END,
           pagado_en = COALESCE(excluded.pagado_en, pagado_en)`,
      ).bind(ctx.colegioId, alumnoId, concepto, /^\d{4}-\d{2}$/.test(t(f.periodo, 7)) ? t(f.periodo, 7) : venc.slice(0, 7),
        monto, venc, pagado ? 'pagado' : 'pendiente', fechaPago, ctx.usuario.id));
    });
    if (sentencias.length) await env.DB.batch(sentencias);
    await auditar(env, ctx, 'importar_pagos', null, null, { filas: sentencias.length, errores: errores.length });
    return json({ creados: sentencias.length, errores });
  });
}

// También la usa el agente de WhatsApp cuando la secretaria manda un Excel o la foto de una ficha.
export async function importarAlumnos(env, ctx, filas) {
    const errores = [];

    const validas = [];
    filas.forEach((f, i) => {
      try {
        const a = validarAlumno(f);
        const ap = {
          nombres: t(f.apoderado_nombres, 80), apellidos: t(f.apoderado_apellidos, 80),
          dni: t(f.apoderado_dni, 12) || null, telefono: normalizarTelefono(f.telefono), email: t(f.email, 120) || null,
          parentesco: t(f.parentesco, 30) || null,
        };
        if (ap.nombres && !ap.dni && !ap.telefono) throw new Error('El apoderado necesita DNI o celular');
        validas.push({ fila: f._fila ?? i + 2, a, ap: ap.nombres ? ap : null, autoriza: siNo(f.autoriza_whatsapp) });
      } catch (e) {
        errores.push({ fila: f._fila ?? i + 2, error: e.message });
      }
    });
    if (!validas.length) return { creados: 0, errores };

    // 1) Alumnos (alta o actualización por código)
    const alumnos = (await env.DB.batch(validas.map(({ a }) => env.DB.prepare(
      `INSERT INTO alumnos (colegio_id, codigo, nombres, apellidos, nombre_busqueda, dni, fecha_nacimiento, nivel, grado, seccion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(colegio_id, codigo) DO UPDATE SET nombres = excluded.nombres, apellidos = excluded.apellidos,
         nombre_busqueda = excluded.nombre_busqueda, dni = COALESCE(excluded.dni, dni),
         fecha_nacimiento = COALESCE(excluded.fecha_nacimiento, fecha_nacimiento), nivel = excluded.nivel,
         grado = excluded.grado, seccion = excluded.seccion, actualizado_en = datetime('now')
       RETURNING id`,
    ).bind(ctx.colegioId, a.codigo, a.nombres, a.apellidos, nombreBusqueda(a.apellidos, a.nombres), a.dni,
      a.fecha_nacimiento, a.nivel, a.grado, a.seccion)))).map((x) => x.results[0].id);

    // 2) Apoderados: se reutilizan por DNI o, si no hay DNI, por celular
    const conAp = validas.map((v, i) => ({ ...v, alumnoId: alumnos[i] })).filter((v) => v.ap);
    if (conAp.length) {
      // Hermanos en el mismo bloque comparten apoderado: se agrupa por DNI o celular
      const unicos = [...new Map(conAp.map((v) => [v.ap.dni || v.ap.telefono, v.ap])).entries()];
      const existentes = (await env.DB.batch(unicos.map(([, ap]) => env.DB.prepare(
        'SELECT id FROM apoderados WHERE colegio_id = ? AND (dni = ? OR (? IS NULL AND telefono = ?)) LIMIT 1',
      ).bind(ctx.colegioId, ap.dni, ap.dni, ap.telefono)))).map((x) => x.results[0]?.id ?? null);

      const idsUnicos = (await env.DB.batch(unicos.map(([, ap], i) => existentes[i]
        ? env.DB.prepare(
          `UPDATE apoderados SET nombres = ?, apellidos = ?, telefono = COALESCE(?, telefono), email = COALESCE(?, email)
            WHERE id = ? RETURNING id`,
        ).bind(ap.nombres, ap.apellidos, ap.telefono, ap.email, existentes[i])
        : env.DB.prepare(
          'INSERT INTO apoderados (colegio_id, nombres, apellidos, dni, telefono, email) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        ).bind(ctx.colegioId, ap.nombres, ap.apellidos, ap.dni, ap.telefono, ap.email),
      ))).map((x) => x.results[0].id);
      const idPorClave = new Map(unicos.map(([k], i) => [k, idsUnicos[i]]));
      const ids = conAp.map((v) => idPorClave.get(v.ap.dni || v.ap.telefono));

      const vinculos = conAp.map((v, i) => env.DB.prepare(
        `INSERT OR IGNORE INTO alumno_apoderado (alumno_id, apoderado_id, parentesco, responsable_pago)
         VALUES (?, ?, ?, NOT EXISTS (SELECT 1 FROM alumno_apoderado WHERE alumno_id = ? AND responsable_pago = 1))`,
      ).bind(v.alumnoId, ids[i], v.ap.parentesco, v.alumnoId));
      // Autorización de WhatsApp firmada en la ficha de matrícula (medio "importacion")
      const consentimientos = conAp.map((v, i) => [v, ids[i]]).filter(([v]) => v.autoriza).map(([v, apId]) => env.DB.prepare(
        `INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio, registrado_por)
         SELECT ?, ?, ?, 'whatsapp', 1, ?, 'importacion', ?
          WHERE NOT EXISTS (SELECT 1 FROM consentimientos WHERE apoderado_id = ? AND alumno_id = ? AND finalidad = 'whatsapp')`,
      ).bind(ctx.colegioId, apId, v.alumnoId, FINALIDADES.whatsapp.version, ctx.usuario.id, apId, v.alumnoId));
      await env.DB.batch([...vinculos, ...consentimientos]);
    }
    await auditar(env, ctx, 'importar_alumnos', null, null, { filas: validas.length, errores: errores.length });
    return { creados: validas.length, errores };
}
