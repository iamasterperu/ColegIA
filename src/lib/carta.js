// Carta de presentación del colegio para familias nuevas. Se arma sola con la información que
// el colegio ya cargó (pensiones, horarios, requisitos, visitas) y con los colores del colegio.
// Si el colegio todavía no tiene su propia carta, esta la reemplaza.
import { respuestaPieza } from './plantillas.js';
import { hoyLima } from './http.js';

export function seccionesCarta(colegio, info) {
  const lineas = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const s = [];
  s.push({
    titulo: `Bienvenidos a ${colegio.nombre}`,
    lineas: info.presentacion
      ? lineas(info.presentacion)
      : [`Gracias por su interés en ${colegio.nombre}. Somos un colegio comprometido con la formación de niños y jóvenes, trabajando de la mano con cada familia.`,
        'Será un gusto recibirlos, conocer a su hijo(a) y mostrarles nuestras aulas.'],
  });
  const bloques = [['Horarios', info.horarios], ['Pensiones y matrícula', info.pension], ['Requisitos de admisión', info.requisitos], ['Pagos', info.pagos], ['Calendario del año', info.calendario], ['Visitas al colegio', info.visitas]];
  for (const [titulo, valor] of bloques) if (lineas(valor).length) s.push({ titulo, lineas: lineas(valor) });
  const contacto = [colegio.direccion && `Dirección: ${colegio.direccion}`, colegio.telefono && `Teléfono: ${colegio.telefono}`].filter(Boolean);
  s.push({ titulo: 'Contáctenos', lineas: [...contacto, 'También puede escribirnos por WhatsApp para agendar su visita.'] });
  return s;
}

export async function responderCarta(env, slug, parte) {
  const colegio = await env.DB.prepare('SELECT * FROM colegios WHERE slug = ?').bind(slug).first();
  if (!colegio) return new Response('No encontrado', { status: 404 });
  const { results } = await env.DB.prepare('SELECT clave, valor FROM info_colegio WHERE colegio_id = ?').bind(colegio.id).all();
  const info = Object.fromEntries(results.map((r) => [r.clave, r.valor]));
  // Solo se publica si el colegio activó la atención a familias nuevas (o es la demostración)
  if (!colegio.es_demo && info.admision_activa !== '1') return new Response('No encontrado', { status: 404 });
  const pieza = { tipo: 'comunicado', titulo: 'Carta de presentación', token: `carta/${slug}`, contenido: {
    titulo: 'Carta de presentación', fecha: hoyLima(), secciones: seccionesCarta(colegio, info), firma: `La Dirección · ${colegio.nombre}`,
  } };
  const r = respuestaPieza(pieza, colegio, parte === 'pdf' ? 'pdf' : null);
  if (parte !== 'pdf') return new Response((await r.text()).replace(`/c/carta/${slug}/pdf`, `/carta/${slug}/pdf`), r);
  return r;
}
