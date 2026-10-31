// Asistente docente: exámenes (A/B, solucionario, rúbrica) y sesiones creadas por
// WhatsApp o desde aquí, con el radar de temas débiles de cada examen.
import { api } from '../api.js';
import { html, crudo, $, fecha, cargando, vacio, aviso, conBoton, pct } from '../ui.js';
import { sesion } from '../app.js';

const NIVEL = { bueno: ['✅ Buena nota', 'color:#0a7a3d;font-weight:600'], regular: ['🟡 Reforzar', 'color:#8a6100;font-weight:600'], ayuda: ['🔴 Necesita ayuda', 'color:#b3261e;font-weight:600'] };
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
        <fieldset class="fuente" style="border:1px dashed var(--borde,#c9cfdb);border-radius:10px;padding:12px;margin:10px 0">
          <legend class="pequeno">Basar el examen en tu material (opcional)</legend>
          <p class="pequeno" style="margin:0 0 8px">Sube una foto de la página del libro, del sílabo o de tu pizarra, un PDF, o pega el enlace de una página web. El examen se arma con eso.</p>
          <div class="form-fila">
            <label>Foto o PDF<input type="file" id="f-archivo" accept="image/*,application/pdf"></label>
            <label style="grid-column: span 2">O enlace de una página web<input type="url" id="f-url" placeholder="https://..."></label>
          </div>
          <div id="f-estado" class="pequeno" role="status"></div>
        </fieldset>
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
  const estado = $('#f-estado', vista);
  let fuente = null; // { texto, origen }
  const leerMaterial = async (peticion) => {
    estado.textContent = 'Leyendo tu material… (puede tardar unos segundos)';
    try {
      fuente = await peticion();
      estado.innerHTML = '';
      estado.append(`✅ Leí tu material (${{ foto: 'foto', pdf: 'PDF', web: 'página web' }[fuente.origen]}): “${fuente.texto.slice(0, 140).replace(/\s+/g, ' ')}…”`);
    } catch (err) { fuente = null; estado.textContent = `⚠️ ${err.message}`; }
  };
  $('#f-archivo', vista)?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    fuente = null; estado.textContent = '';
    if (!f) return;
    $('#f-url', vista).value = '';
    if (f.type === 'application/pdf') return leerMaterial(() => api.subir('/api/documentos/fuente', f, 'application/pdf'));
    if (!f.type.startsWith('image/')) { estado.textContent = '⚠️ Sube una foto (JPG o PNG) o un PDF.'; return; }
    const liviana = await reducirImagen(f);
    return leerMaterial(() => api.subir('/api/documentos/fuente', liviana, 'image/jpeg'));
  });
  $('#f-url', vista)?.addEventListener('change', async (e) => {
    const url = e.target.value.trim();
    fuente = null; estado.textContent = '';
    if (!url) return;
    $('#f-archivo', vista).value = '';
    return leerMaterial(() => api.post('/api/documentos/fuente', { url }));
  });
  $('#f-doc', vista)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('#f-archivo', vista).files[0] && !fuente) { aviso('Espera a que termine de leer tu material, o quítalo.', 'error'); return; }
    if ($('#f-url', vista).value.trim() && !fuente) { aviso('No pude leer ese enlace. Corrígelo o bórralo para crear sin material.', 'error'); return; }
    const boton = $('.btn-primario', e.target);
    boton.textContent = 'Creando… (hasta 1 minuto)';
    await conBoton(boton, async () => {
      const datos = Object.fromEntries(new FormData(e.target));
      if (fuente) { datos.fuente = fuente.texto; datos.origen_fuente = fuente.origen; }
      const r = await api.post('/api/documentos', datos);
      aviso('Listo: documento creado');
      location.hash = `#/docente/${r.id}`;
    });
  });
}

// Reduce la foto del celular (varios MB) a una imagen liviana antes de subirla
export async function reducirImagen(archivo, lado = 1600) {
  try {
    const bmp = await createImageBitmap(archivo);
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bmp.width * k); lienzo.height = Math.round(bmp.height * k);
    lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((ok, fallo) => lienzo.toBlob((b) => (b ? ok(b) : fallo(new Error('x'))), 'image/jpeg', 0.85));
  } catch { return archivo; }
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
    ${d.tipo === 'examen' && ['direccion', 'profesor'].includes(sesion.usuario.rol) ? crudo(html`<section class="tarjeta" id="calif"><h2>Calificar con fotos</h2>
      <p class="pequeno">Cuando tus alumnos terminen y tú revises los exámenes, toma una foto de cada hoja calificada (que se vea el nombre y la nota, o las respuestas marcadas) y súbelas aquí. Si el examen tiene varias hojas, sube las fotos en orden: la hoja con el nombre primero y después las otras hojas de ese mismo alumno; ColegIA las junta solas.
        ColegIA lee el nombre, la nota y el porcentaje, y marca quién sacó buena nota y quién necesita ayuda. Tú solo revisas y guardas.</p>
      <label class="btn" style="cursor:pointer">📷 Subir fotos de exámenes calificados
        <input type="file" id="c-fotos" accept="image/*" multiple style="position:absolute;opacity:0;width:1px;height:1px"></label>
      <div id="c-estado" class="pequeno" role="status" style="margin-top:8px"></div>
      <div id="c-tabla"></div></section>`) : ''}
    ${r ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Radar de temas débiles</h2><span class="pequeno">${r.alumnos.length} alumnos calificados</span></div>
      ${r.alumnos.length ? crudo(html`<div class="barras-h">${r.temas.map((t) => html`<div class="barra-h" title="${t.errores} errores de ${t.intentos} respuestas">
          <span>${t.tema}</span><div class="riel"><div class="relleno" style="width:${Math.max(2, t.error * 100)}%"></div></div><span class="num">${pct(t.error)} error</span></div>`)}</div>
        <h3 style="margin-top:16px">Resultados</h3>
        <div class="tabla-caja"><table><thead><tr><th>Alumno</th><th class="num">Nota (0-20)</th><th class="num">%</th><th>Cómo le fue</th><th>Preguntas falladas</th></tr></thead>
          <tbody>${r.alumnos.map((a) => html`<tr><td>${a.apellidos}, ${a.nombres}</td><td class="num">${a.puntaje}</td><td class="num">${a.porcentaje == null ? '—' : Math.round(a.porcentaje) + '%'}</td>
            <td>${NIVEL[a.nivel] ? crudo(html`<span class="etiqueta" style="${NIVEL[a.nivel][1]}">${NIVEL[a.nivel][0]}</span>`) : '—'}</td><td>${a.sin_detalle ? 'no se registró el detalle' : (a.falladas.join(', ') || '—')}</td></tr>`)}</tbody></table></div>`)
        : crudo(html`<p class="pequeno">Para ver el radar, el profesor envía por WhatsApp: <code>resultados ${d.id}: Mateo Quispe 2 5 9; Ana Paz 1</code></p>`)}
    </section>`) : ''}
    ${d.tipo === 'examen' ? crudo(html`<section class="tarjeta"><h2>Preguntas (versión A)</h2>
      <ol>${c.preguntas.map((q) => html`<li style="margin-bottom:10px"><strong>${q.p}</strong> <span class="etiqueta">${q.tema}</span>
        <ol type="a">${q.o.map((o, i) => html`<li style="${i === q.c ? 'color:var(--ok);font-weight:600' : ''}">${o}${i === q.c ? ' ✓' : ''}</li>`)}</ol></li>`)}</ol></section>`) : ''}
    ${d.tipo === 'sesion' ? crudo(html`<section class="tarjeta"><h2>Propósito</h2><p>${c.proposito || ''}</p>
      ${['inicio', 'desarrollo', 'cierre'].map((k) => html`<h3>${k[0].toUpperCase() + k.slice(1)}</h3><ul>${(c[k] || []).map((p) => html`<li>${p}</li>`)}</ul>`)}</section>`) : ''}
    ${d.tipo === 'material' || d.tipo === 'texto' ? crudo(html`<section class="tarjeta"><p style="white-space:pre-wrap">${c.texto}</p></section>`) : ''}`;
  activarCalificacion(vista, d);
}

function activarCalificacion(vista, d) {
  const entrada = $('#c-fotos', vista);
  if (!entrada) return;
  const estado = $('#c-estado', vista);
  const tabla = $('#c-tabla', vista);
  let aula = null;
  const lecturas = []; // una por foto, en el orden en que se subieron
  const fallidas = new Set();
  let filas = [];
  const ediciones = new Map(); // lo que el profesor corrigió, por grupo de fotos
  const clave = (f) => f.fotos.join(',');
  const nivel = (pct) => (pct >= 70 ? 'bueno' : pct >= 50 ? 'regular' : 'ayuda');
  const rango = (fotos) => (fotos.length === 1 ? `Foto ${fotos[0]}` : `Fotos ${fotos[0]}-${fotos[fotos.length - 1]}`);
  const dibujar = () => {
    if (!filas.length) { tabla.innerHTML = ''; return; }
    const opciones = (f) => html`<option value="">— elegir alumno —</option>${aula.map((a) => html`<option value="${a.id}" ${f.alumno_id === a.id ? crudo('selected') : ''}>${a.apellidos}, ${a.nombres} (${a.grado} ${a.seccion})</option>`)}`;
    tabla.innerHTML = html`<div class="tabla-caja" style="margin-top:12px"><table><thead><tr><th>Fotos</th><th>Alumno</th><th class="num">Nota (0-20)</th><th class="num">%</th><th>Cómo le fue</th><th></th></tr></thead>
      <tbody>${filas.map((f, i) => !f.leido
        ? html`<tr><td class="pequeno">${rango(f.fotos)}<div>${f.nombre_leido ? `leído: ${f.nombre_leido}` : ''}</div></td>
            <td><select data-alumno="${i}">${opciones(f)}</select></td>
            <td colspan="3" style="color:#b3261e">⚠️ ${f.conflicto ? `Las hojas dicen notas distintas (${f.conflicto.join(' y ')}). Corrige la nota aquí:` : 'No encontré la nota. Escríbela aquí o toma otra foto:'}
              <input type="number" min="0" max="20" step="0.5" data-nota="${i}" style="width:70px" placeholder="0-20"></td>
            <td><button class="btn" data-quitar="${i}">Quitar</button></td></tr>`
        : html`<tr><td class="pequeno">${rango(f.fotos)}<div>${f.nombre_leido ? `leído: ${f.nombre_leido}` : 'sin nombre en las hojas'}</div></td>
          <td><select data-alumno="${i}">${opciones(f)}</select></td>
          <td class="num"><input type="number" min="0" max="20" step="0.5" value="${f.puntaje}" data-nota="${i}" style="width:70px"></td>
          <td class="num" data-pct="${i}">${Math.round(f.porcentaje)}%</td>
          <td data-nivel="${i}"><span class="etiqueta" style="${NIVEL[nivel(f.porcentaje)][1]}">${NIVEL[nivel(f.porcentaje)][0]}</span></td>
          <td><button class="btn" data-quitar="${i}">Quitar</button></td></tr>`)}</tbody></table></div>
      <label style="display:block;margin:10px 0"><input type="checkbox" id="c-bimestre"> También guardar como nota del bimestre actual en ${d.curso || 'el curso'} (puedes dejarlo sin marcar)</label>
      <button class="btn btn-primario" id="c-guardar">Guardar resultados</button>`.toString();
    tabla.querySelectorAll('[data-alumno]').forEach((el) => el.addEventListener('change', () => {
      const f = filas[el.dataset.alumno]; f.alumno_id = Number(el.value) || null;
      ediciones.set(clave(f), { ...(ediciones.get(clave(f)) || {}), alumno_id: f.alumno_id });
    }));
    tabla.querySelectorAll('[data-nota]').forEach((el) => el.addEventListener('input', () => {
      const f = filas[el.dataset.nota];
      if (el.value === '') return;
      f.puntaje = Math.min(20, Math.max(0, Number(el.value) || 0)); f.porcentaje = (f.puntaje / 20) * 100; f.falladas = null; f.manual = true;
      ediciones.set(clave(f), { ...(ediciones.get(clave(f)) || {}), puntaje: f.puntaje });
      const pct = tabla.querySelector(`[data-pct="${el.dataset.nota}"]`);
      if (pct) { pct.textContent = `${Math.round(f.porcentaje)}%`; tabla.querySelector(`[data-nivel="${el.dataset.nota}"]`).innerHTML = `<span class="etiqueta" style="${NIVEL[nivel(f.porcentaje)][1]}">${NIVEL[nivel(f.porcentaje)][0]}</span>`; }
    }));
    tabla.querySelectorAll('[data-quitar]').forEach((el) => el.addEventListener('click', () => { filas.splice(Number(el.dataset.quitar), 1); dibujar(); }));
    $('#c-guardar', tabla)?.addEventListener('click', async (ev) => {
      const validas = filas.filter((f) => f.manual || f.leido);
      if (!validas.length) { aviso('Falta la nota de cada alumno.', 'error'); return; }
      if (validas.some((f) => !f.alumno_id)) { aviso('Elige el alumno de cada examen (o quita ese grupo de fotos).', 'error'); return; }
      if (new Set(validas.map((f) => f.alumno_id)).size !== validas.length) { aviso('Hay dos grupos de fotos del mismo alumno. Quita uno.', 'error'); return; }
      await conBoton(ev.target, async () => {
        const r = await api.post(`/api/documentos/${d.id}/resultados`, {
          guardar_nota: $('#c-bimestre', tabla).checked,
          filas: validas.map((f) => ({ alumno_id: f.alumno_id, porcentaje: f.porcentaje, falladas: f.falladas })),
        });
        aviso(`Listo: ${r.guardados} resultado(s) guardados${r.nota_bimestre ? ' y registrados como nota del bimestre' : ''}`);
        detalle(vista, d.id);
      });
    });
  };
  const reagrupar = async () => {
    const nuevas = await api.post(`/api/documentos/${d.id}/agrupar`, { lecturas });
    filas = nuevas.map((f) => {
      const e = ediciones.get(clave(f));
      if (!e) return f;
      const g = { ...f, ...(e.alumno_id !== undefined ? { alumno_id: e.alumno_id } : {}) };
      if (e.puntaje !== undefined) Object.assign(g, { leido: true, manual: true, puntaje: e.puntaje, porcentaje: (e.puntaje / 20) * 100, falladas: null });
      return g;
    });
  };
  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files].slice(0, 120);
    entrada.value = '';
    if (!archivos.length) return;
    try { aula ??= await api.get(`/api/documentos/${d.id}/aula`); } catch (e) { aviso(e.message, 'error'); return; }
    for (let i = 0; i < archivos.length; i++) {
      estado.textContent = `Leyendo foto ${i + 1} de ${archivos.length}…`;
      try { lecturas.push(await api.subir(`/api/documentos/${d.id}/calificar-foto`, await reducirImagen(archivos[i]), 'image/jpeg')); }
      catch { lecturas.push({}); fallidas.add(lecturas.length); }
    }
    try { await reagrupar(); dibujar(); } catch (e) { aviso(e.message, 'error'); }
    estado.textContent = (fallidas.size ? `⚠️ No pude leer: foto ${[...fallidas].join(', ')}. ` : '') +
      'Si el examen tiene varias hojas, sube las fotos en orden: primero la hoja con el nombre y luego las siguientes de ese alumno. Revisa y guarda.';
  });
}
