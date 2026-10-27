// Ficha 360: muestra solo las secciones que el rol puede ver (el servidor ya filtró).
import { api } from '../api.js';
import { html, crudo, $, soles, fecha, telefonoBonito, modal, aviso, conBoton, cargando, ROL_NOMBRE, ACCIONES } from '../ui.js';
import { icono, puede } from '../app.js';

const FIN = { whatsapp: 'WhatsApp', salud: 'Salud', imagen: 'Imagen', tutor_ia: 'Tutor IA' };

function claseNota(n) {
  if (/^\d+$/.test(n)) return Number(n) < 11 ? 'nota-baja' : '';
  return `nota-${n}`;
}

function seccionNotas(ac) {
  if (!ac.notas.length) return '<p class="pequeno">Sin notas registradas.</p>';
  const cursos = [...new Set(ac.notas.map((n) => n.curso))];
  const bims = [...new Set(ac.notas.map((n) => n.bimestre))].sort();
  const nota = (c, b) => ac.notas.find((n) => n.curso === c && n.bimestre === b)?.nota ?? '—';
  const dias = ac.asistencia.reduce((s, m) => s + m.dias_habiles, 0);
  const faltas = ac.asistencia.reduce((s, m) => s + m.faltas, 0);
  const tard = ac.asistencia.reduce((s, m) => s + m.tardanzas, 0);
  return html`
    <div class="tabla-caja"><table class="notas">
      <thead><tr><th>Curso</th>${bims.map((b) => html`<th class="num">${b}° bim.</th>`)}</tr></thead>
      <tbody>${cursos.map((c) => html`<tr><td>${c}</td>${bims.map((b) => html`<td class="${claseNota(nota(c, b))}">${nota(c, b)}</td>`)}</tr>`)}</tbody>
    </table></div>
    ${dias ? html`<p style="margin:12px 0 0"><strong>Asistencia del año:</strong> ${Math.round(((dias - faltas) / dias) * 100)}% · ${faltas} faltas · ${tard} tardanzas</p>` : ''}`;
}

function seccionAprendizaje(ac) {
  if (!ac.examenes?.length && !ac.tutor?.length) return '';
  return html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Exámenes y tutor IA</h2></div>
    ${ac.examenes.length ? crudo(html`<div class="tabla-caja"><table>
      <thead><tr><th>Examen</th><th class="num">Puntaje</th><th>Temas que falló</th></tr></thead>
      <tbody>${ac.examenes.map((e) => html`<tr><td>${e.titulo}<div class="pequeno">${fecha(e.fecha)}</div></td>
        <td class="num ${e.puntaje != null && e.puntaje < 11 ? 'nota-baja' : ''}">${e.puntaje ?? '—'}</td>
        <td class="pequeno">${e.temas.join(', ') || (e.falladas ? `${e.falladas} pregunta(s)` : 'Ninguno')}</td></tr>`)}</tbody>
    </table></div>`) : crudo('<p class="pequeno">Sin exámenes calificados por WhatsApp.</p>')}
    ${ac.tutor.length ? crudo(html`<p style="margin:12px 0 6px"><strong>Practicó con el tutor IA</strong> <span class="pequeno">(últimos 60 días; solo temas, no conversaciones)</span></p>
      <div class="chips">${ac.tutor.map((t) => html`<span class="etiqueta ${t.trabado ? 'etiqueta-alerta' : ''}" title="${t.veces} consulta(s)">${t.tema}${t.trabado ? ' · le costó' : ''}</span>`)}</div>`) : ''}
  </section>`;
}

function seccionPagos(p, alumnoId) {
  return html`
    <div class="resumen-pagos">
      <div><span>Pagado</span><strong>${soles(p.pagado)}</strong></div>
      <div><span>Vencido</span><strong style="color:var(--peligro)">${soles(p.vencido)}</strong></div>
      <div><span>Por vencer</span><strong>${soles(p.pendiente - p.vencido)}</strong></div>
    </div>
    <div class="tabla-caja"><table>
      <thead><tr><th>Concepto</th><th>Vence</th><th class="num">Monto</th><th>Estado</th>${puede('pagos.editar') ? crudo('<th></th>') : ''}</tr></thead>
      <tbody>${p.cuotas.map((c) => {
        const vencida = c.estado === 'pendiente' && c.vencimiento < new Date().toISOString().slice(0, 10);
        return html`<tr>
          <td>${c.concepto}</td><td>${fecha(c.vencimiento)}</td><td class="num">${soles(c.monto_centimos)}</td>
          <td>${c.estado === 'pagado' ? crudo(html`<span class="etiqueta etiqueta-ok">Pagado ${fecha(c.pagado_en)}</span>`)
            : vencida ? crudo('<span class="etiqueta etiqueta-peligro">Vencida</span>') : crudo('<span class="etiqueta">Pendiente</span>')}</td>
          ${puede('pagos.editar') ? crudo(html`<td>${c.estado === 'pendiente' ? crudo(html`<button class="btn btn-chico" data-pagar="${c.id}" data-alumno="${alumnoId}">Registrar pago</button>`) : ''}</td>`) : ''}
        </tr>`;
      })}</tbody>
    </table></div>`;
}

export async function mostrar(vista, [id], sesion) {
  vista.innerHTML = cargando('Abriendo ficha…');
  const f = await api.get(`/api/alumnos/${encodeURIComponent(id)}/ficha`);
  const p = f.personal;
  const salud = f.salud;
  const alertas = salud && !salud.sin_consentimiento && (salud.alergias || salud.condicion_medica);
  const esPadre = sesion.usuario.rol === 'padre';

  vista.innerHTML = html`
    <p class="pequeno"><a href="#/inicio">← ${esPadre ? 'Mis hijos' : 'Volver al buscador'}</a></p>
    <section class="tarjeta">
      <div class="ficha-cabecera">
        <div class="avatar">${p.nombres[0]}${p.apellidos[0] || ''}</div>
        <div style="flex:1;min-width:200px">
          <h1>${p.nombres} ${p.apellidos}</h1>
          <div class="chips" style="margin-top:6px">
            <span class="etiqueta">${p.grado} · ${p.seccion}</span>
            <span class="etiqueta">Código ${p.codigo}</span>
            ${p.estado !== 'matriculado' ? crudo(html`<span class="etiqueta etiqueta-alerta">${p.estado}</span>`) : ''}
            ${f.pagos ? crudo(f.pagos.vencido ? html`<span class="etiqueta etiqueta-peligro">Deuda vencida ${soles(f.pagos.vencido)}</span>` : '<span class="etiqueta etiqueta-ok">Pagos al día</span>') : ''}
            ${f.pagos_estado ? crudo(f.pagos_estado.al_dia ? '<span class="etiqueta etiqueta-ok">Pagos al día</span>' : html`<span class="etiqueta etiqueta-peligro">${f.pagos_estado.cuotas_vencidas} cuota(s) vencida(s)</span>`) : ''}
            ${alertas ? crudo('<span class="etiqueta etiqueta-peligro">⚠ Alerta de salud</span>') : ''}
          </div>
        </div>
        <div class="acciones">
          ${puede('alumnos.editar') ? crudo('<button class="btn" id="editar">Editar</button>') : ''}
          ${sesion.usuario.rol === 'direccion' ? crudo('<button class="btn btn-peligro" id="anonimizar" title="Derecho de cancelación (ARCO)">Anonimizar</button>') : ''}
          <button class="btn" data-imprimir>Imprimir</button>
        </div>
      </div>
    </section>

    ${alertas ? crudo(html`<div class="alerta-salud" style="margin-top:16px"><strong>Salud:</strong> ${[salud.alergias && `Alergia: ${salud.alergias}`, salud.condicion_medica].filter(Boolean).join(' · ')}</div>`) : ''}

    <div class="rejilla-2" style="margin-top:16px">
      <div>
        ${f.academico ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Notas y asistencia</h2></div>${crudo(seccionNotas(f.academico))}</section>`) : ''}
        ${f.academico ? crudo(seccionAprendizaje(f.academico)) : ''}
        ${f.pagos ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Pagos ${sesion.colegio.anio_escolar}</h2></div>${crudo(seccionPagos(f.pagos, f.id))}</section>`) : ''}
        ${f.mensajes ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Últimos mensajes de WhatsApp</h2>
            <a class="btn btn-chico" href="#/whatsapp/${f.apoderados?.[0]?.telefono || ''}">Abrir chat</a></div>
          ${f.mensajes.length ? crudo(html`<ul class="lista-actividad">${f.mensajes.slice(0, 8).map((m) => html`<li><span>${m.sentido === 'entrante' ? '⬅' : '➡'} ${(m.texto || m.transcripcion || '[audio]').slice(0, 90)}</span><span class="pequeno">${fecha(m.creado_en, true)}</span></li>`)}</ul>`) : crudo('<p class="pequeno">Sin mensajes.</p>')}</section>`) : ''}
      </div>
      <div>
        <section class="tarjeta"><div class="tarjeta-titulo"><h2>Datos del alumno</h2></div>
          <dl class="datos">
            <div><dt>Nivel</dt><dd>${p.nivel}</dd></div>
            ${p.dni !== undefined ? crudo(html`<div><dt>DNI</dt><dd>${p.dni || '—'}</dd></div><div><dt>Nacimiento</dt><dd>${fecha(p.fecha_nacimiento)}</dd></div>`) : ''}
            ${p.observaciones ? crudo(html`<div style="grid-column:1/-1"><dt>Observaciones</dt><dd>${p.observaciones}</dd></div>`) : ''}
          </dl>
        </section>
        ${f.apoderados ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Apoderados</h2></div>
          ${f.apoderados.map((a) => html`<div style="margin-bottom:12px">
            <strong>${a.nombres} ${a.apellidos}</strong> <span class="pequeno">${a.parentesco || ''}${a.responsable_pago ? ' · responsable de pago' : ''}</span>
            ${a.telefono ? crudo(html`<div class="pequeno">📱 ${telefonoBonito(a.telefono)}${a.email ? ` · ${a.email}` : ''}</div>`) : ''}
            <div class="chips" style="margin-top:4px">${Object.entries(FIN).map(([k, t]) => html`<span class="etiqueta ${a.consentimientos[k] ? 'etiqueta-ok' : a.consentimientos[k] === false ? 'etiqueta-peligro' : ''}">${t}: ${a.consentimientos[k] ? 'autorizó' : a.consentimientos[k] === false ? 'no autorizó' : 'pendiente'}</span>`)}</div>
          </div>`)}</section>`) : ''}
        ${salud ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Salud</h2><span class="etiqueta">Dato sensible</span></div>
          ${salud.sin_consentimiento ? crudo('<p class="pequeno">El apoderado no autorizó el tratamiento de datos de salud, por eso no se registran (Ley 29733, art. 13).</p>')
            : crudo(html`<dl class="datos">
              <div><dt>Alergias</dt><dd>${salud.alergias || 'Ninguna registrada'}</dd></div>
              <div><dt>Condición</dt><dd>${salud.condicion_medica || 'Ninguna registrada'}</dd></div>
              ${salud.solo_alertas ? '' : crudo(html`<div><dt>Seguro</dt><dd>${salud.seguro || '—'}</dd></div><div><dt>Emergencia</dt><dd>${salud.contacto_emergencia || '—'}</dd></div>`)}
            </dl>`)}</section>`) : ''}
        ${'utiles' in f ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Lista de útiles</h2></div>
          ${f.utiles ? crudo(html`<p><a href="#/utiles/${f.utiles.id}">${f.utiles.titulo}</a> · ${f.utiles.items} ítems${f.utiles.entregados != null ? ` · entregó ${f.utiles.entregados}` : ''} ${f.utiles.publicada ? '' : crudo('<span class="etiqueta etiqueta-alerta">Borrador</span>')}</p>`) : crudo('<p class="pequeno">Aún no hay lista para este grado.</p>')}</section>`) : ''}
        ${f.accesos ? crudo(html`<section class="tarjeta"><div class="tarjeta-titulo"><h2>Quién vio esta ficha</h2></div>
          <ul class="lista-actividad">${f.accesos.slice(0, 10).map((a) => html`<li><span>${a.usuario_nombre || 'Sistema'} <span class="pequeno">(${ROL_NOMBRE[a.rol] || a.rol})</span> · ${ACCIONES[a.accion] || a.accion}</span><span class="pequeno">${fecha(a.creado_en, true)}</span></li>`)}</ul></section>`) : ''}
      </div>
    </div>
    <p class="nota-legal" style="margin-top:16px">${crudo(icono('escudo'))}<span>Esta consulta quedó registrada a nombre de ${sesion.usuario.nombre} (${sesion.usuario.rol_nombre}). Solo ves la información que tu rol necesita (Ley 29733).</span></p>`;

  vista.onclick = (e) => {
    const pagar = e.target.closest('[data-pagar]');
    if (pagar) registrarPago(pagar.dataset.pagar, () => mostrar(vista, [id], sesion));
  };
  $('#editar', vista)?.addEventListener('click', () => editar(f, sesion, () => mostrar(vista, [id], sesion)));
  $('#anonimizar', vista)?.addEventListener('click', async (e) => {
    if (!confirm('¿Anonimizar a este alumno? Se borran sus datos personales, notas y salud. Los pagos se conservan sin nombre por obligación contable. No se puede deshacer.')) return;
    await conBoton(e.target, async () => {
      await api.post(`/api/alumnos/${f.id}/anonimizar`);
      aviso('Alumno anonimizado');
      location.hash = '#/inicio';
    });
  });
}

export function registrarPago(pagoId, alTerminar) {
  const { raiz, cerrar } = modal(html`<h2>Registrar pago</h2>
    <form class="form" id="f-pago">
      <div class="form-fila">
        <label>Medio<select name="medio">${['efectivo', 'transferencia', 'yape', 'plin', 'tarjeta', 'deposito'].map((m) => html`<option>${m}</option>`)}</select></label>
        <label>Fecha de pago<input type="date" name="fecha" value="${new Date().toISOString().slice(0, 10)}"></label>
      </div>
      <button class="btn btn-primario">Guardar pago</button>
    </form>`, { ancho: 420 });
  $('#f-pago', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    await conBoton(e.submitter || $('button', raiz), async () => {
      await api.post(`/api/pagos/${pagoId}/pagar`, Object.fromEntries(new FormData(e.target)));
      aviso('Pago registrado');
      cerrar();
      alTerminar();
    });
  });
}

function editar(f, sesion, alTerminar) {
  const p = f.personal;
  const s = f.salud && !f.salud.sin_consentimiento && !f.salud.solo_alertas ? f.salud : null;
  const { raiz, cerrar } = modal(html`<h2>Editar alumno</h2>
    <form class="form" id="f-alumno">
      <div class="form-fila">
        <label>Nombres<input name="nombres" value="${p.nombres}" required></label>
        <label>Apellidos<input name="apellidos" value="${p.apellidos}" required></label>
      </div>
      <div class="form-fila">
        <label>DNI<input name="dni" value="${p.dni || ''}" inputmode="numeric"></label>
        <label>Nacimiento<input type="date" name="fecha_nacimiento" value="${p.fecha_nacimiento || ''}"></label>
      </div>
      <div class="form-fila">
        <label>Grado<input name="grado" value="${p.grado}" required></label>
        <label>Sección<input name="seccion" value="${p.seccion}" required></label>
        <label>Estado<select name="estado">${['matriculado', 'retirado'].map((x) => html`<option ${x === p.estado ? 'selected' : ''}>${x}</option>`)}</select></label>
      </div>
      <label>Observaciones<textarea name="observaciones">${p.observaciones || ''}</textarea></label>
      ${s ? crudo(html`<fieldset class="form" style="border:1px solid var(--borde);border-radius:8px;padding:12px"><legend>Salud (autorizado por el apoderado)</legend>
        <div class="form-fila"><label>Alergias<input name="alergias" value="${s.alergias || ''}"></label><label>Condición médica<input name="condicion_medica" value="${s.condicion_medica || ''}"></label></div>
        <div class="form-fila"><label>Seguro<input name="seguro" value="${s.seguro || ''}"></label><label>Contacto de emergencia<input name="contacto_emergencia" value="${s.contacto_emergencia || ''}"></label></div>
      </fieldset>`) : f.salud?.sin_consentimiento ? crudo('<p class="pequeno">Para registrar datos de salud, un apoderado debe autorizarlo primero.</p>') : ''}
      <button class="btn btn-primario">Guardar cambios</button>
    </form>`, { ancho: 640 });
  $('#f-alumno', raiz).addEventListener('submit', async (e) => {
    e.preventDefault();
    await conBoton($('button.btn-primario', raiz), async () => {
      await api.put(`/api/alumnos/${f.id}`, Object.fromEntries(new FormData(e.target)));
      aviso('Cambios guardados');
      cerrar();
      alTerminar();
    });
  });
}
