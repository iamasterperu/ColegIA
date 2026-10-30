// Panel de automatización: avisos automáticos, comunicados por aprobar, cumpleaños, reportes,
// registro de exámenes, reinscripción y facturación electrónica.
import { api } from '../api.js';
import { html, crudo, $, $$, fecha, cargando, vacio, aviso, conBoton, soles } from '../ui.js';

const TOGGLES = [
  ['cumple_auto', 'Saludos de cumpleaños a alumnos (por el WhatsApp de sus padres), padres, profesores, auxiliares y personal'],
  ['fiestas_auto', 'Comunicados por feriados y fechas especiales (Día de la Madre, del Padre, Fiestas Patrias…): llegan primero a dirección y secretaría para aprobarlos'],
  ['asistencia_reporte', 'Reporte diario de asistencia y exámenes a dirección (10 a. m., de lunes a viernes)'],
  ['reporte_auto', 'Reporte mensual con todo lo que se hizo en la app, a dirección y secretaría (último día del mes)'],
  ['resumen_diario', 'Resumen del colegio a dirección cada mañana (8 a. m.)'],
  ['recordatorio_auto', 'Recordatorios amables de pensión a los padres, automáticos'],
  ['alertas_padres', 'Aviso amable a los padres cuando su hijo necesita apoyo (alerta temprana)'],
];
const ORIGEN = { tema: 'Tema escrito', foto: 'Foto', pdf: 'PDF', web: 'Página web' };

export async function mostrar(vista) {
  vista.innerHTML = html`<div class="encabezado"><div><h1>Automatización</h1><p>Lo que ColegIA hace solo. Los comunicados masivos de fiestas nunca salen sin tu aprobación; las pensiones sí se recuerdan solas si lo activas.</p></div></div><div id="cont">${cargando()}</div>`;
  const cargar = async () => {
    const d = await api.get('/api/automatizacion');
    const [rein, rep, exa] = d.admin ? await Promise.all([api.get('/api/reinscripcion'), api.get('/api/reportes/mes'), api.get('/api/examenes')]) : [null, null, null];
    $('#cont', vista).innerHTML = html`
      <section class="tarjeta"><h2>Comunicados por aprobar</h2>
        ${d.borradores.length ? d.borradores.map((b) => html`<div class="faq" style="border-bottom:1px solid var(--linea,#e4e7ee);padding:10px 0"><strong>${b.titulo}</strong> <span class="etiqueta">${b.estado}</span> <span class="pequeno">${fecha(b.fecha)}</span>
          <p>${b.texto}</p>${b.estado === 'pendiente' ? html`<p><button class="btn btn-primario ap" data-id="${b.id}">Aprobar y enviar a todos</button> <button class="btn ed" data-id="${b.id}" data-t="${b.texto}">Editar</button> <button class="btn re" data-id="${b.id}">Descartar</button></p>` : ''}</div>`) : vacio('Cuando se acerque un feriado o una fecha especial, aparecerá aquí un comunicado ya redactado.')}</section>
      <section class="tarjeta"><h2>Cumplen años hoy</h2>${d.cumples_hoy.length ? html`<ul>${d.cumples_hoy.map((c) => html`<li>🎂 ${c.nombre} <span class="pequeno">(${c.tipo}${c.detalle ? `, ${c.detalle}` : ''})</span></li>`)}</ul>` : vacio('Hoy no cumple años nadie registrado.')}</section>
      ${d.admin ? html`
      <section class="tarjeta"><h2>Avisos automáticos</h2><form class="form" id="f-auto">
        ${TOGGLES.map(([k, t]) => html`<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="${k}" ${d.config[k] ? crudo('checked') : ''}> <span>${t}</span></label>`)}
        <button class="btn btn-primario">Guardar</button></form></section>
      <section class="tarjeta"><h2>Cumpleaños del personal</h2>
        <p class="pequeno">Cada persona también puede escribir al WhatsApp del colegio: <em>mi cumpleaños 12 de mayo</em>. El año no hace falta.</p>
        <div class="tabla-caja"><table><thead><tr><th>Nombre</th><th>Cargo</th><th>Cumpleaños</th></tr></thead><tbody>
        ${d.usuarios.map((u) => html`<tr><td>${u.nombre}</td><td>${u.rol}</td><td><input type="date" class="fu" data-tipo="usuario" data-id="${u.id}" value="${u.fecha_nacimiento || ''}"></td></tr>`)}
        ${d.personal.map((u) => html`<tr><td>${u.nombre}</td><td>${u.cargo || 'Personal'}</td><td><input type="date" class="fu" data-tipo="personal" data-id="${u.id}" value="${u.fecha_nacimiento || ''}"></td></tr>`)}
        </tbody></table></div>
        <h3>Añadir auxiliar o personal sin acceso a la app</h3>
        <form class="form" id="f-personal"><input name="nombre" placeholder="Nombre completo" required><input name="cargo" placeholder="Cargo (auxiliar, portería…)"><input name="telefono" inputmode="numeric" placeholder="Celular con 51…"><label>Cumpleaños<input type="date" name="fecha_nacimiento"></label><button class="btn btn-primario">Añadir</button></form></section>
      <section class="tarjeta"><h2>Reinscripción ${rein.anio}</h2>
        <p>✅ ${rein.resumen.confirmada || 0} confirmaron · ❌ ${rein.resumen.no_continua || 0} no continúan · ⏳ ${rein.resumen.pendiente || 0} sin responder</p>
        <p><button class="btn btn-primario" id="rein">Preguntar a las familias si continúan</button></p>
        ${rein.lista.length ? html`<div class="tabla-caja"><table><thead><tr><th>Alumno</th><th>Aula</th><th>Estado</th></tr></thead><tbody>${rein.lista.map((a) => html`<tr><td>${a.apellidos} ${a.nombres}</td><td>${a.grado} ${a.seccion}</td><td>${a.estado === 'pendiente' ? 'Sin responder' : 'No continúa'}</td></tr>`)}</tbody></table></div>` : ''}</section>
      <section class="tarjeta"><h2>Reporte de ${rep.nombre}</h2>
        ${rep.secciones.map((s) => html`<h3>${s.titulo}</h3><ul>${s.lineas.map((l) => html`<li>${l}</li>`)}</ul>`)}
        <p><button class="btn" id="rep">Enviar este reporte ahora a dirección y secretaría</button></p></section>
      <section class="tarjeta"><h2>Registro de exámenes y sesiones</h2>
        ${exa.documentos.length ? html`<div class="tabla-caja"><table><thead><tr><th>Fecha</th><th>Profesor</th><th>Tipo</th><th>Curso</th><th>Aula</th><th>Origen</th></tr></thead><tbody>
          ${exa.documentos.map((x) => html`<tr><td>${fecha(x.creado_en, true)}</td><td>${x.profesor}</td><td>${x.tipo}</td><td>${x.curso || x.titulo}</td><td>${x.grado || ''}</td><td>${ORIGEN[x.fuente] || ''}</td></tr>`)}</tbody></table></div>` : vacio('Cuando un profesor cree un examen aparecerá aquí.')}</section>
      <section class="tarjeta"><h2>Boletas y facturas electrónicas (Nubefact)</h2>
        <p class="pequeno">El colegio contrata a Nubefact y aquí se conectan sus datos una sola vez. Nunca se pide la clave SOL. El token se guarda cifrado.</p>
        <form class="form" id="f-nbf"><label>RUTA<input name="ruta" placeholder="https://api.nubefact.com/api/v1/…" value="${d.nubefact.ruta}"></label>
          <label>TOKEN ${d.nubefact.token_guardado ? '(ya guardado: déjalo vacío para no cambiarlo)' : ''}<input name="token" type="password" autocomplete="off"></label>
          <label>Serie de boletas<input name="serie_boleta" maxlength="4" placeholder="B001" value="${d.nubefact.serie_boleta}"></label>
          <label>Serie de facturas<input name="serie_factura" maxlength="4" placeholder="F001" value="${d.nubefact.serie_factura}"></label>
          <label>Tipo de operación (confírmalo con el contador del colegio)<select name="tipo_igv"><option value="9" ${d.nubefact.tipo_igv === 9 ? crudo('selected') : ''}>Inafecto</option><option value="8" ${d.nubefact.tipo_igv === 8 ? crudo('selected') : ''}>Exonerado</option><option value="1" ${d.nubefact.tipo_igv === 1 ? crudo('selected') : ''}>Gravado con IGV</option></select></label>
          <button class="btn btn-primario">Guardar</button></form>
        <p class="pequeno">Para emitir: contabilidad escribe por WhatsApp <em>boleta Nombre del alumno</em> o <em>factura Nombre 20123456789 Razón Social</em> después de registrar el pago.</p>
        ${d.comprobantes.length ? html`<div class="tabla-caja"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Número</th><th>Cliente</th><th>Total</th><th>Estado</th></tr></thead><tbody>
          ${d.comprobantes.map((c) => html`<tr><td>${fecha(c.creado_en, true)}</td><td>${c.tipo}</td><td>${c.serie || ''}-${c.numero || ''}</td><td>${c.cliente_nombre || ''}</td><td>${soles(c.total_centimos)}</td><td>${c.estado === 'error' ? c.detalle : (c.enlace_pdf ? html`<a href="${c.enlace_pdf}" target="_blank" rel="noopener">${c.detalle || 'emitido'}</a>` : c.detalle)}</td></tr>`)}</tbody></table></div>` : ''}</section>` : ''}`;

    $$('.ap', vista).forEach((b) => b.addEventListener('click', () => conBoton(b, async () => { const r = await api.post(`/api/borradores/${b.dataset.id}/aprobar`); aviso('Aprobado'); await cargar(); })));
    $$('.re', vista).forEach((b) => b.addEventListener('click', () => conBoton(b, async () => { await api.post(`/api/borradores/${b.dataset.id}/rechazar`); aviso('Descartado'); await cargar(); })));
    $$('.ed', vista).forEach((b) => b.addEventListener('click', async () => {
      const t = window.prompt('Nuevo texto del comunicado', b.dataset.t);
      if (t) { await api.put(`/api/borradores/${b.dataset.id}`, { texto: t }); aviso('Actualizado'); await cargar(); }
    }));
    if (!d.admin) return;
    $('#f-auto', vista).addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await conBoton($('.btn-primario', e.target), async () => { await api.put('/api/automatizacion', Object.fromEntries(TOGGLES.map(([k]) => [k, fd.get(k) === 'on']))); aviso('Guardado'); });
    });
    $$('.fu', vista).forEach((i) => i.addEventListener('change', async () => {
      if (i.dataset.tipo === 'personal') await api.put(`/api/personal/${i.dataset.id}`, { fecha_nacimiento: i.value });
      else await api.put('/api/cumpleanos', { tipo: 'usuario', id: Number(i.dataset.id), fecha: i.value });
      aviso('Cumpleaños guardado');
    }));
    $('#f-personal', vista).addEventListener('submit', async (e) => {
      e.preventDefault();
      await conBoton($('.btn-primario', e.target), async () => { await api.post('/api/personal', Object.fromEntries(new FormData(e.target))); aviso('Añadido'); await cargar(); });
    });
    $('#rein', vista).addEventListener('click', (e) => conBoton(e.target, async () => {
      if (!window.confirm('¿Enviar la pregunta de reinscripción a las familias que autorizaron WhatsApp?')) return;
      const r = await api.post('/api/reinscripcion/iniciar'); aviso(`Enviado a ${r.enviados} familias`); await cargar();
    }));
    $('#rep', vista).addEventListener('click', (e) => conBoton(e.target, async () => { await api.post('/api/reportes/enviar', { mes: rep.mes }); aviso('Reporte en camino'); }));
    $('#f-nbf', vista).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      await conBoton($('.btn-primario', e.target), async () => { await api.put('/api/nubefact', { ...f, tipo_igv: Number(f.tipo_igv) }); aviso('Facturación guardada'); await cargar(); });
    });
  };
  await cargar();
}
