// Carga mágica por WhatsApp: la secretaria manda la foto de una lista de útiles o de
// una ficha de matrícula, o un Excel, y ColegIA lo ordena. Siempre pide "SI" antes de
// guardar. Las fotos no se guardan: solo los datos que la persona confirma.
import { leerImagen, hayIA } from '../../ia/modelo.js';
import { leerXlsx, leerCsv, mapearColumnas } from '../../../public/js/lib/xlsx.js';
import { importarAlumnos } from '../../rutas/importar.js';
import { auditoria } from '../comun.js';
import { gradoEn } from './personal.js';

const SINONIMOS_UTILES = {
  cantidad: ['cantidad', 'cant', 'qty', 'unidades', 'n', 'nro'],
  descripcion: ['descripcion', 'material', 'materiales', 'util', 'utiles', 'articulo', 'item', 'producto'],
  detalle: ['detalle', 'observacion', 'observaciones', 'marca'],
};
const SINONIMOS_ALUMNOS = {
  codigo: ['codigo', 'cod', 'codigo alumno'], apellidos: ['apellidos', 'apellido'], nombres: ['nombres', 'nombre'],
  dni: ['dni', 'dni alumno', 'documento'], grado: ['grado'], seccion: ['seccion', 'aula'], nivel: ['nivel'],
  apoderado_nombres: ['nombres apoderado', 'apoderado'], apoderado_apellidos: ['apellidos apoderado'],
  apoderado_dni: ['dni apoderado'], telefono: ['celular', 'telefono', 'whatsapp'], parentesco: ['parentesco'],
  autoriza_whatsapp: ['autoriza whatsapp'],
};

const listaTexto = (items) => items.slice(0, 25).map((i) => `• ${i.cantidad ? `${i.cantidad} ` : ''}${i.descripcion}${i.detalle ? ` (${i.detalle})` : ''}`).join('\n') + (items.length > 25 ? `\n… y ${items.length - 25} más` : '');

async function pedirGradoOConfirmar(env, colegio, items, pista, origen) {
  const grado = pista ? await gradoEn(env, colegio, pista) : null;
  if (!grado) {
    return { texto: `📚 Leí ${items.length} útiles${origen}:\n${listaTexto(items)}\n\n¿Para qué grado es? (ej.: 3° Primaria)`, pendiente: { accion: 'grado_utiles', datos: { items } } };
  }
  return confirmarUtiles(grado, items, origen);
}

export const confirmarUtiles = (grado, items, origen = '') => ({
  texto: `📚 *Lista de útiles de ${grado}*${origen} — ${items.length} ítems:\n${listaTexto(items)}\n\n¿La guardo y la publico para los padres? Responde *SI* o *NO*.`,
  pendiente: { accion: 'confirmar', datos: { tipo: 'guardar_utiles', grado, items } },
});

export async function cargaImagen(env, colegio, persona, imagen, caption) {
  if (!hayIA(env)) return { texto: 'No puedo leer fotos en este momento (IA desactivada). Súbela desde la web.' };
  const r = await leerImagen(env, imagen,
    'Analiza la imagen de un colegio peruano. ' +
    'Si es una LISTA DE ÚTILES responde {"tipo":"utiles","grado":"grado si aparece","items":[{"cantidad":"2","descripcion":"cuaderno cuadriculado A4","detalle":""}]}. ' +
    'Si es una FICHA DE MATRÍCULA o datos de un alumno responde {"tipo":"matricula","alumno":{"nombres":"","apellidos":"","dni":"","fecha_nacimiento":"AAAA-MM-DD","grado":"","seccion":"","direccion":""},"apoderado":{"nombres":"","apellidos":"","dni":"","telefono":"","parentesco":""}}. ' +
    'Si es otra cosa responde {"tipo":"otro","descripcion":"qué es"}. Copia los datos tal como aparecen; si un dato no se lee, déjalo vacío.',
    { json: true, maxTokens: 1800 });
  if (r.tipo === 'utiles' && Array.isArray(r.items) && r.items.length) {
    const items = r.items.filter((i) => i?.descripcion).map((i) => ({ cantidad: String(i.cantidad || ''), descripcion: String(i.descripcion), detalle: String(i.detalle || '') }));
    return pedirGradoOConfirmar(env, colegio, items, `${caption} ${r.grado || ''}`, ' de la foto');
  }
  if (r.tipo === 'matricula' && r.alumno?.nombres) {
    const a = r.alumno;
    const p = r.apoderado || {};
    return {
      texto: `🧾 *Ficha de matrícula leída*\nAlumno: ${a.nombres} ${a.apellidos}\nDNI: ${a.dni || '—'} · Nac.: ${a.fecha_nacimiento || '—'}\nGrado: ${a.grado || '—'} ${a.seccion || ''}\nDirección: ${a.direccion || '—'}\nApoderado: ${p.nombres || '—'} ${p.apellidos || ''} (${p.parentesco || '—'}) · DNI ${p.dni || '—'} · Cel. ${p.telefono || '—'}\n\n¿Lo registro? Responde *SI* o *NO* (si algo está mal, corrígelo luego en la web).`,
      pendiente: { accion: 'confirmar', datos: { tipo: 'matricula', alumno: a, apoderado: p } },
    };
  }
  return { texto: `Vi la foto (${r.descripcion || 'no la reconocí'}). Puedo leer *listas de útiles* y *fichas de matrícula*. ¿Me mandas una de esas?` };
}

export async function cargaExcel(env, colegio, persona, documento) {
  const nombre = (documento.nombre || '').toLowerCase();
  let tabla;
  try {
    tabla = nombre.endsWith('.csv') ? leerCsv(new TextDecoder().decode(documento.datos)) : await leerXlsx(documento.datos);
  } catch {
    return { texto: 'No pude abrir ese archivo. Mándalo como Excel (.xlsx) o CSV.' };
  }
  if (tabla.length < 2) return { texto: 'El archivo no tiene filas.' };
  const mapaAlumnos = mapearColumnas(tabla[0], SINONIMOS_ALUMNOS);
  const campos = Object.values(mapaAlumnos);
  if (campos.includes('codigo') && campos.includes('grado') && (campos.includes('nombres') || campos.includes('apellidos'))) {
    const filas = tabla.slice(1, 91).map((f, n) => ({ _fila: n + 2, ...Object.fromEntries(Object.entries(mapaAlumnos).map(([i, c]) => [c, f[i] ?? ''])) }));
    return {
      texto: `👨‍🎓 Leí ${filas.length} alumnos de *${documento.nombre}*${tabla.length > 91 ? ' (los primeros 90; para más, usa Importar en la web)' : ''}. Ejemplo: ${filas[0].apellidos || ''} ${filas[0].nombres || ''} — ${filas[0].grado || ''}.\n¿Los registro? Responde *SI* o *NO*.`,
      pendiente: { accion: 'confirmar', datos: { tipo: 'excel_alumnos', filas } },
    };
  }
  let mapa = mapearColumnas(tabla[0], SINONIMOS_UTILES);
  let datos = tabla.slice(1);
  if (!Object.values(mapa).includes('descripcion')) {
    datos = tabla;
    mapa = /^\d+$/.test(tabla[0][0] || '') ? { 0: 'cantidad', 1: 'descripcion', 2: 'detalle' } : { 0: 'descripcion', 1: 'detalle' };
  }
  const items = datos.map((f) => Object.fromEntries(Object.entries(mapa).map(([i, c]) => [c, String(f[i] ?? '')]))).filter((i) => i.descripcion).slice(0, 150);
  return pedirGradoOConfirmar(env, colegio, items, documento.nombre, ` de ${documento.nombre}`);
}

export async function ejecutarCarga(env, colegio, persona, datos) {
  const u = persona.usuario;
  if (datos.tipo === 'guardar_utiles') {
    const anio = colegio.anio_escolar || new Date().getFullYear();
    const lista = await env.DB.prepare(
      `INSERT INTO listas_utiles (colegio_id, grado, anio, titulo, fuente, publicada, creado_por) VALUES (?, ?, ?, ?, 'foto', 1, ?)
       ON CONFLICT(colegio_id, grado, anio) DO UPDATE SET fuente = 'foto', publicada = 1, creado_por = excluded.creado_por, creado_en = datetime('now')
       RETURNING id`,
    ).bind(colegio.id, datos.grado, anio, `Lista de útiles ${datos.grado} ${anio}`, u.id).first();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM utiles_items WHERE lista_id = ?').bind(lista.id),
      ...datos.items.map((i, n) => env.DB.prepare('INSERT INTO utiles_items (lista_id, orden, cantidad, descripcion, detalle) VALUES (?, ?, ?, ?, ?)')
        .bind(lista.id, n, i.cantidad || null, i.descripcion.slice(0, 200), i.detalle || null)),
      auditoria(env, colegio, persona, 'guardar_lista_utiles', 'lista_utiles', lista.id, { grado: datos.grado, items: datos.items.length }),
    ]);
    return `✅ Lista de útiles de ${datos.grado} publicada (${datos.items.length} ítems). Los padres ya la reciben al escribir "útiles". Para avisarles, escribe *avisar ${datos.grado}: ya está la lista de útiles*.`;
  }
  if (datos.tipo === 'matricula') {
    const a = datos.alumno;
    const p = datos.apoderado;
    const sig = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) + 1 n FROM alumnos').first();
    const codigo = `${colegio.slug.slice(0, 2).toUpperCase()}${String(sig.n).padStart(4, '0')}`;
    const r = await importarAlumnos(env, { colegioId: colegio.id, usuario: u }, [{
      codigo, nombres: a.nombres, apellidos: a.apellidos, dni: (a.dni || '').replace(/\D/g, '') || '', fecha_nacimiento: a.fecha_nacimiento,
      grado: a.grado || 'Por asignar', seccion: a.seccion || 'A', apoderado_nombres: p.nombres, apoderado_apellidos: p.apellidos,
      apoderado_dni: (p.dni || '').replace(/\D/g, ''), telefono: p.telefono, parentesco: p.parentesco,
    }]);
    if (!r.creados) return `No pude registrarlo: ${r.errores[0]?.error || 'datos incompletos'}. Corrígelo en la web.`;
    if (a.direccion) await env.DB.prepare('UPDATE alumnos SET direccion = ? WHERE colegio_id = ? AND codigo = ?').bind(String(a.direccion).slice(0, 200), colegio.id, codigo).run();
    return `✅ ${a.nombres} ${a.apellidos} registrado con el código ${codigo}. Su apoderado recibirá el pedido de autorización cuando escriba al colegio.`;
  }
  if (datos.tipo === 'excel_alumnos') {
    const r = await importarAlumnos(env, { colegioId: colegio.id, usuario: u }, datos.filas);
    return `✅ ${r.creados} alumno(s) registrados.${r.errores.length ? ` ${r.errores.length} fila(s) con problemas, por ejemplo fila ${r.errores[0].fila}: ${r.errores[0].error}.` : ''}`;
  }
  return null;
}
