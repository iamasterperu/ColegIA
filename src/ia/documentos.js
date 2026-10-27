// Documentos del asistente docente: se guardan en D1 y se descargan en PDF con un
// enlace secreto (/d/<token>/<parte>.pdf) que WhatsApp puede adjuntar.
import { tokenAleatorio } from '../lib/cripto.js';
import { pdfExamen, pdfSesion, pdfTexto } from './docente.js';

export async function guardarDocumento(env, colegioId, usuarioId, d) {
  const token = tokenAleatorio(16);
  const fila = await env.DB.prepare(
    `INSERT INTO documentos (colegio_id, usuario_id, tipo, titulo, grado, curso, pedido, contenido, token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(colegioId, usuarioId, d.tipo, String(d.titulo).slice(0, 150), d.grado || null, d.curso || null,
    String(d.pedido || '').slice(0, 500), JSON.stringify(d.contenido), token).first();
  return { id: fila.id, token };
}

export const PARTES = {
  examen: [['a', 'Versión A'], ['b', 'Versión B'], ['solucionario', 'Solucionario'], ['rubrica', 'Rúbrica']],
  sesion: [['sesion', 'Sesión de aprendizaje']],
  material: [['texto', 'Material adaptado']],
  texto: [['texto', 'Documento']],
};

export const enlace = (origen, token, parte) => `${origen}/d/${token}/${parte}.pdf`;

const nombreArchivo = (titulo, parte) =>
  `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 50)}_${parte}.pdf`;

export function archivo(doc, parte) {
  return nombreArchivo(doc.titulo, parte);
}

// GET /d/:token/:parte.pdf — público por enlace secreto (no contiene datos personales)
export function rutasDocumentosPublicos(r) {
  r.get('/d/:token/:parte', async (ctx, env) => {
    const parte = ctx.params.parte.replace(/\.pdf$/, '');
    const doc = await env.DB.prepare('SELECT * FROM documentos WHERE token = ?').bind(ctx.params.token).first();
    if (!doc || !PARTES[doc.tipo]?.some(([p]) => p === parte)) return new Response('Documento no encontrado', { status: 404 });
    const colegio = await env.DB.prepare('SELECT nombre, color_primario FROM colegios WHERE id = ?').bind(doc.colegio_id).first();
    doc.contenido = JSON.parse(doc.contenido);
    const bytes = doc.tipo === 'examen' ? pdfExamen(doc, colegio, parte) : doc.tipo === 'sesion' ? pdfSesion(doc, colegio) : pdfTexto(doc, colegio);
    return new Response(bytes, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${nombreArchivo(doc.titulo, parte)}"`,
        'cache-control': 'private, max-age=300',
        'x-robots-tag': 'noindex',
      },
    });
  });
}
