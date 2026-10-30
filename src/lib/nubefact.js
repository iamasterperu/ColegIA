// Boletas y facturas electrónicas con Nubefact (el proveedor que el colegio contrata).
// ColegIA solo envía los datos del pago ya registrado; nunca se pide la clave SOL.
// Cada colegio guarda su RUTA y su TOKEN de Nubefact (el token va cifrado) y sus series.
import { cifrar, descifrar } from './cripto.js';
import { soles } from './http.js';
import { validarRuc } from './ruc.js';

export const configurado = (c) => !!(c.nbf_ruta && c.nbf_token_cifrado && c.nbf_serie_boleta);

export async function guardarConfig(env, colegioId, d) {
  const campos = [];
  const valores = [];
  if (d.ruta !== undefined) {
    if (d.ruta && !/^https:\/\/api\.nubefact\.com\/api\/v1\/[\w-]+$/i.test(d.ruta)) throw new Error('La RUTA de Nubefact debe empezar con https://api.nubefact.com/api/v1/');
    campos.push('nbf_ruta = ?'); valores.push(d.ruta || null);
  }
  if (d.token) { campos.push('nbf_token_cifrado = ?'); valores.push(await cifrar(env, d.token)); }
  for (const [k, col] of [['serie_boleta', 'nbf_serie_boleta'], ['serie_factura', 'nbf_serie_factura']]) {
    if (d[k] !== undefined) {
      if (d[k] && !/^[A-Z0-9]{4}$/.test(String(d[k]).toUpperCase())) throw new Error('La serie debe tener 4 caracteres (por ejemplo B001 o F001)');
      campos.push(`${col} = ?`); valores.push(d[k] ? String(d[k]).toUpperCase() : null);
    }
  }
  if (d.tipo_igv !== undefined) { campos.push('nbf_tipo_igv = ?'); valores.push([1, 8, 9].includes(Number(d.tipo_igv)) ? Number(d.tipo_igv) : 9); }
  if (!campos.length) return;
  await env.DB.prepare(`UPDATE colegios SET ${campos.join(', ')} WHERE id = ?`).bind(...valores, colegioId).run();
}

const fechaNubefact = (iso) => iso.split('-').reverse().join('-');

// Arma el JSON de Nubefact. tipo_de_igv: 1 gravado, 8 exonerado, 9 inafecto (lo define el contador del colegio).
export function armarComprobante(colegio, { tipo, numero, cliente, concepto, totalCentimos, fecha }) {
  const total = Math.round(totalCentimos) / 100;
  const tipoIgv = Number(colegio.nbf_tipo_igv) || 9;
  const base = tipoIgv === 1 ? Math.round((total / 1.18) * 100) / 100 : total;
  const igv = tipoIgv === 1 ? Math.round((total - base) * 100) / 100 : 0;
  return {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: tipo === 'factura' ? 1 : 2,
    serie: tipo === 'factura' ? colegio.nbf_serie_factura : colegio.nbf_serie_boleta,
    numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: cliente.docTipo,
    cliente_numero_de_documento: cliente.doc,
    cliente_denominacion: cliente.nombre,
    cliente_direccion: cliente.direccion || '-',
    cliente_email: cliente.email || '',
    fecha_de_emision: fechaNubefact(fecha),
    moneda: 1,
    porcentaje_de_igv: 18,
    total_gravada: tipoIgv === 1 ? base : '',
    total_exonerada: tipoIgv === 8 ? total : '',
    total_inafecta: tipoIgv === 9 ? total : '',
    total_igv: igv || '',
    total,
    enviar_automaticamente_a_la_sunat: true,
    enviar_automaticamente_al_cliente: false,
    items: [{
      unidad_de_medida: 'ZZ', codigo: 'EDU', descripcion: concepto, cantidad: 1, valor_unitario: base, precio_unitario: total,
      subtotal: base, tipo_de_igv: tipoIgv, total, igv, anticipo_regularizacion: false,
    }],
  };
}

// Persona que recibe el comprobante: boleta (DNI o sin documento) o factura (RUC validado)
export function clienteDe({ tipo, apoderado, ruc, razon }) {
  if (tipo === 'factura') {
    const error = validarRuc(ruc || '');
    if (error) throw new Error(error);
    if (!razon || razon.trim().length < 3) throw new Error('Falta la razón social para la factura');
    return { docTipo: 6, doc: ruc, nombre: razon.trim().slice(0, 150) };
  }
  const dni = String(apoderado?.dni || '').replace(/\D/g, '');
  const nombre = `${apoderado?.nombres || ''} ${apoderado?.apellidos || ''}`.trim() || 'Cliente varios';
  return dni.length === 8 ? { docTipo: 1, doc: dni, nombre, email: apoderado.email } : { docTipo: '-', doc: '-', nombre, email: apoderado?.email };
}

export async function emitir(env, colegio, datos, llamar = fetch) {
  if (!configurado(colegio)) throw new Error('Falta conectar Nubefact: RUTA, TOKEN y serie de boletas en Ajustes.');
  if (datos.tipo === 'factura' && !colegio.nbf_serie_factura) throw new Error('Falta la serie de facturas (por ejemplo F001) en Ajustes.');
  const token = await descifrar(env, colegio.nbf_token_cifrado);
  if (!token) throw new Error('No se pudo leer el token de Nubefact guardado.');
  const resp = await llamar(colegio.nbf_ruta, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Token token="${token}"` }, body: JSON.stringify(datos.json),
  });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok || r.errors) throw new Error(`Nubefact rechazó el comprobante: ${String(r.errors || r.error || resp.status).slice(0, 200)}`);
  return { serie: r.serie, numero: r.numero, enlace_pdf: r.enlace_del_pdf || r.enlace, aceptada: !!r.aceptada_por_sunat, bruto: r };
}

// Siguiente número de la serie (los números los controla ColegIA; coincide con lo que está en Nubefact)
export async function siguienteNumero(env, colegioId, serie) {
  const f = await env.DB.prepare('SELECT MAX(numero) n FROM comprobantes WHERE colegio_id = ? AND serie = ?').bind(colegioId, serie).first();
  return (f?.n || 0) + 1;
}

// Emite el comprobante de un pago ya registrado como pagado y lo guarda
export async function emitirPago(env, colegio, pagoId, { tipo = 'boleta', ruc, razon, usuarioId }, llamar = fetch) {
  const p = await env.DB.prepare(
    `SELECT p.*, a.nombres alumno FROM pagos p JOIN alumnos a ON a.id = p.alumno_id WHERE p.id = ? AND p.colegio_id = ?`,
  ).bind(pagoId, colegio.id).first();
  if (!p) throw new Error('No encontré ese pago.');
  if (p.estado !== 'pagado') throw new Error('Solo se emite comprobante de pagos ya registrados como pagados.');
  const ya = await env.DB.prepare("SELECT id FROM comprobantes WHERE pago_id = ? AND estado = 'emitido'").bind(pagoId).first();
  if (ya) throw new Error('Ese pago ya tiene comprobante.');
  const apoderado = await env.DB.prepare(
    `SELECT ap.* FROM alumno_apoderado aa JOIN apoderados ap ON ap.id = aa.apoderado_id WHERE aa.alumno_id = ? ORDER BY aa.responsable_pago DESC LIMIT 1`,
  ).bind(p.alumno_id).first();
  const cliente = clienteDe({ tipo, apoderado, ruc, razon });
  const serie = tipo === 'factura' ? colegio.nbf_serie_factura : colegio.nbf_serie_boleta;
  const numero = await siguienteNumero(env, colegio.id, serie);
  const json = armarComprobante(colegio, {
    tipo, numero, cliente, totalCentimos: p.monto_centimos, fecha: (p.pagado_en || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    concepto: `${p.concepto}${p.periodo ? ` ${p.periodo}` : ''} — ${p.alumno}`.slice(0, 200),
  });
  let r;
  try { r = await emitir(env, colegio, { tipo, json }, llamar); } catch (e) {
    await env.DB.prepare("INSERT INTO comprobantes (colegio_id, pago_id, tipo, serie, numero, total_centimos, estado, detalle, emitido_por) VALUES (?, ?, ?, ?, ?, ?, 'error', ?, ?)")
      .bind(colegio.id, pagoId, tipo, serie, numero, p.monto_centimos, String(e.message).slice(0, 300), usuarioId ?? null).run();
    throw e;
  }
  const f = await env.DB.prepare(
    `INSERT INTO comprobantes (colegio_id, pago_id, tipo, serie, numero, cliente_doc_tipo, cliente_doc, cliente_nombre, total_centimos, enlace_pdf, detalle, emitido_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(colegio.id, pagoId, tipo, r.serie || serie, r.numero || numero, String(cliente.docTipo), cliente.doc, cliente.nombre, p.monto_centimos, r.enlace_pdf || null,
    r.aceptada ? 'aceptada por SUNAT' : 'enviada a SUNAT', usuarioId ?? null).first();
  return { id: f.id, serie: r.serie || serie, numero: r.numero || numero, enlace_pdf: r.enlace_pdf, total: soles(p.monto_centimos), apoderado, alumno: p.alumno, alumno_id: p.alumno_id };
}
