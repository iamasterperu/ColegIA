// Asistente docente: exámenes (A/B, solucionario, rúbrica) y sesiones creadas por
// WhatsApp o desde aquí, con el radar de temas débiles de cada examen.
import { api } from '../api.js';
import { html, crudo, $, fecha, cargando, vacio, aviso, conBoton, pct } from '../ui.js';
import { sesion } from '../app.js';

const TIPO = { examen: '📝 Examen', sesion: '📘 Sesión', material: '🧩 Material adaptado', texto: '📄 Documento' };

export async function mostrar(vista, [id]) {
  if (id) return detalle(vista, id);
  vista.innerHTML = cargando();
  const docs = await api.get('/api/documentos');
  const puedeCrear = ['direccion', 'profesor'].includes(sesion.usuario.rol);
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Asistente docente</h1>
      <p>Los profesores piden por WhatsApp (texto, audio o foto del libro) “examen de 20 preguntas de fracciones para 2°” y lo reciben en PDF con versión A, versión B, solucionario y rúbrica. Aquí se ve todo lo creado.</p></div></div>
    ${puedeCrear ? crudo(html`<section class="tarjeta"><h2>Crear desde la web</h2>
      <form class="form" id="f-doc"><div class="form-fila">
        <label style="grid-column: span 3">¿Qué necesitas?<input name="pedido" required minlength="8" placeholder="Examen de 10 preguntas sobre el sistema solar para 4° de primaria"></label>
        <label>Tipo<select name="tipo"><option value="examen">Examen A/B</option><option value="sesion">Sesión de clase</option></select></label></div>
        <button class="btn btn-primario">Crear con IA</button></form></section>`) : ''}
    <section class="tarjeta">
      ${docs.length ? crudo(html`<div class="tabla-caja"><table>
        <thead><tr><th>Código</th><th>Tipo</th><th>Título</th><th>Autor</th><th>Creado</th><th>Calificados</th><th>PDF</th></tr></thead>
        <tbody>${docs.map((d) => html`<tr>
          <td>${d.id}</td><td>${TIPO[d.tipo]}</td><td><a href="#/docente/${d.id}">${d.titulo}</a><div class="pequeno">${d.curso || ''} ${d.grado || ''}</div></td>
          <td>${d.autor}</td><td>${fecha(d.creado_en, true)}</td><td class="num">${d.tipo === 'examen' ? d.calificados : '—'}</td>
          <td><div class="chips">${d.pdfs.map((p) => html`<a class="chip" href="${p.url}" target="_blank" rel="noopener">${p.nombre}</a>`)}</div></td></tr>`)}</tbody></table></div>`)
        : vacio('Todavía no hay documentos. Pide uno por WhatsApp: "examen de 10 preguntas de fracciones para 2°".')}
    </section>`;
  $('#f-doc', vista)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = $('.btn-primario', e.target);
    boton.textContent = 'Creando… (hasta 1 minuto)';
    await conBoton(boton, async () => {
      const r = await api.post('/api/documentos', Object.fromEntries(new FormData(e.target)));
      aviso('Listo: documento creado');
      location.hash = `#/docente/${r.id}`;
    });
  });
}

async function detalle(vista, id) {
  vista.innerHTML = cargando();
  const d = await api.get(`/api/documentos/${encodeURIComponent(id)}`);
  const c = d.contenido;
  const r = d.radar;
  vista.innerHTML = html`
    <p class="pequeno"><a href="#/docente">← Asistente docente</a></p>
    <div class="encabezado"><div><h1>${d.titulo}</h1><p>${TIPO[d.tipo]} · código ${d.id} · ${fecha(d.creado_en, true)}</p>
      <p class="pequeno">Pedido: “${d.pedido}”</p></div>
      <div class="chips">${d.pdfs.map((p) => html`<a class="btn" href="${p.url}" target="_blank" rel="noopener">${p.nombre} (PDF)</a>`)}</div></div>
    ${r ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Radar de temas débiles</h2><span class="pequeno">${r.alumnos.length} alumnos calificados</span></div>
      ${r.alumnos.length ? crudo(html`<div class="barras-h">${r.temas.map((t) => html`<div class="barra-h" title="${t.errores} errores de ${t.intentos} respuestas">
          <span>${t.tema}</span><div class="riel"><div class="relleno" style="width:${Math.max(2, t.error * 100)}%"></div></div><span class="num">${pct(t.error)} error</span></div>`)}</div>
        <h3 style="margin-top:16px">Resultados</h3>
        <div class="tabla-caja"><table><thead><tr><th>Alumno</th><th class="num">Nota</th><th>Preguntas falladas</th></tr></thead>
          <tbody>${r.alumnos.map((a) => html`<tr><td>${a.apellidos}, ${a.nombres}</td><td class="num">${a.puntaje}</td><td>${a.falladas.join(', ') || '—'}</td></tr>`)}</tbody></table></div>`)
        : crudo(html`<p class="pequeno">Para ver el radar, el profesor envía por WhatsApp: <code>resultados ${d.id}: Mateo Quispe 2 5 9; Ana Paz 1</code></p>`)}
    </section>`) : ''}
    ${d.tipo === 'examen' ? crudo(html`<section class="tarjeta"><h2>Preguntas (versión A)</h2>
      <ol>${c.preguntas.map((q) => html`<li style="margin-bottom:10px"><strong>${q.p}</strong> <span class="etiqueta">${q.tema}</span>
        <ol type="a">${q.o.map((o, i) => html`<li style="${i === q.c ? 'color:var(--ok);font-weight:600' : ''}">${o}${i === q.c ? ' ✓' : ''}</li>`)}</ol></li>`)}</ol></section>`) : ''}
    ${d.tipo === 'sesion' ? crudo(html`<section class="tarjeta"><h2>Propósito</h2><p>${c.proposito || ''}</p>
      ${['inicio', 'desarrollo', 'cierre'].map((k) => html`<h3>${k[0].toUpperCase() + k.slice(1)}</h3><ul>${(c[k] || []).map((p) => html`<li>${p}</li>`)}</ul>`)}</section>`) : ''}
    ${d.tipo === 'material' || d.tipo === 'texto' ? crudo(html`<section class="tarjeta"><p style="white-space:pre-wrap">${c.texto}</p></section>`) : ''}`;
}
