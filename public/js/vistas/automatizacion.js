// Panel de automatización: avisos automáticos, comunicados por aprobar, cumpleaños, reportes,
// registro de exámenes, reinscripción y facturación electrónica.
import { api } from '../api.js';
import { html, crudo, $, $$, fecha, cargando, vacio, aviso, conBoton, soles } from '../ui.js';
import { leerHoja, mapearColumnas, fechaIso } from '../lib/xlsx.js';
import { reducirImagen } from './docente.js';

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
      <section class="tarjeta"><h2>Cumpleaños: cargar las fechas de todos</h2>
        <p class="pequeno">ColegIA saluda solo, sin pedir aprobación, a quien tenga <strong>fecha de nacimiento</strong> y <strong>celular</strong> registrados. Las fechas de los alumnos ya vienen de la matrícula. Para padres y personal puedes cargarlas aquí, de dos formas.</p>
        <div id="cu-estado" class="pequeno">${cargando()}</div>
        <h3>1. Con un Excel</h3>
        <p class="pequeno">Columnas: nombre, dni, fecha de nacimiento, celular y cargo (el cargo solo para personal que aún no está registrado). ColegIA reconoce a cada persona por su DNI o por su nombre y, si le falta el celular, lo completa. <a href="#" id="cu-plantilla">Descargar plantilla</a> · <a href="#" id="cu-faltan">Descargar lista de quienes faltan</a></p>
        <label class="btn" style="cursor:pointer">📊 Elegir Excel o CSV<input type="file" id="cu-excel" accept=".xlsx,.csv,.txt" style="position:absolute;opacity:0;width:1px;height:1px"></label>
        <h3>2. Con fotos de DNI</h3>
        <p class="pequeno">Sube la foto de cada DNI (padres, personal o alumnos). ColegIA lee el nombre y la fecha de nacimiento, ve a quién corresponde y tú confirmas. La foto no se guarda.</p>
        <label class="btn" style="cursor:pointer">📷 Subir fotos de DNI<input type="file" id="cu-dni" accept="image/*" multiple style="position:absolute;opacity:0;width:1px;height:1px"></label>
        <div id="cu-salida" style="margin-top:10px"></div></section>
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
    activarCumples(vista);
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

const CAMPOS_CUMPLE = {
  nombre: ['nombre', 'nombres', 'nombre completo', 'apellidos y nombres', 'persona', 'trabajador', 'padre', 'apoderado'],
  apellidos: ['apellidos', 'apellido'],
  dni: ['dni', 'documento', 'documento de identidad'],
  fecha: ['fecha de nacimiento', 'nacimiento', 'cumpleanos', 'fecha nac', 'fecha', 'f nacimiento'],
  telefono: ['celular', 'telefono', 'whatsapp', 'movil', 'cel'],
  cargo: ['cargo', 'rol', 'puesto', 'funcion'],
};
const descargarCsv = (nombre, filas) => {
  const csv = '\ufeff' + filas.map((f) => f.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

async function activarCumples(vista) {
  const salida = $('#cu-salida', vista);
  let faltan = [];
  const pintarEstado = async () => {
    try {
      const e = await api.get('/api/cumpleanos/estado');
      faltan = e.sin_fecha.lista;
      $('#cu-estado', vista).innerHTML = html`
        <p>🎂 Con fecha registrada: <strong>${e.alumnos.con_fecha}/${e.alumnos.total}</strong> alumnos · <strong>${e.apoderados.con_fecha}/${e.apoderados.total}</strong> padres · <strong>${e.personal.con_fecha}/${e.personal.total}</strong> personal</p>
        ${e.sin_saludo.total ? html`<details><summary>⚠️ ${e.sin_saludo.total} persona(s) con fecha que quedarían sin saludo (falta celular o autorización de WhatsApp)</summary><ul>${e.sin_saludo.lista.map((x) => html`<li>${x.nombre} <span class="pequeno">(${x.tipo}: ${x.motivo})</span></li>`)}</ul></details>` : ''}
        ${e.sin_fecha.total ? html`<details><summary>Faltan fechas de ${e.sin_fecha.total} persona(s)</summary><ul>${e.sin_fecha.lista.map((x) => html`<li>${x.nombre} <span class="pequeno">(${x.tipo})</span></li>`)}${e.sin_fecha.total > e.sin_fecha.lista.length ? html`<li class="pequeno">… y más</li>` : ''}</ul></details>` : html`<p>✅ Todos tienen fecha registrada.</p>`}`.toString();
    } catch (err) { $('#cu-estado', vista).textContent = err.message; }
  };
  pintarEstado();
  $('#cu-plantilla', vista).addEventListener('click', (e) => { e.preventDefault(); descargarCsv('cumpleanos_plantilla.csv', [['nombre', 'dni', 'fecha_nacimiento', 'celular', 'cargo'], ['María Elena Quispe', '41234567', '14/05/1980', '987654321', 'Directora'], ['Carmen Rojas Díaz', '42345678', '03/11/1985', '987654322', '']]); });
  $('#cu-faltan', vista).addEventListener('click', (e) => { e.preventDefault(); descargarCsv('cumpleanos_faltantes.csv', [['nombre', 'dni', 'fecha_nacimiento', 'celular', 'cargo'], ...faltan.map((x) => [x.nombre.replace(/^(.+?), (.+?)( \(.+\))?$/, '$2 $1'), '', '', '', ''])]); });

  $('#cu-excel', vista).addEventListener('change', async (e) => {
    const archivo = e.target.files[0]; e.target.value = '';
    if (!archivo) return;
    salida.textContent = 'Leyendo el archivo…';
    try {
      const tabla = await leerHoja(archivo);
      const mapa = mapearColumnas(tabla[0], CAMPOS_CUMPLE);
      const campos = Object.values(mapa);
      if (!campos.includes('fecha') || !(campos.includes('nombre') || campos.includes('dni'))) throw new Error('No encontré las columnas. Necesito al menos "nombre" (o "dni") y "fecha de nacimiento". Usa la plantilla.');
      const filas = tabla.slice(1).map((fila, i) => {
        const o = { _fila: i + 2 };
        Object.entries(mapa).forEach(([col, campo]) => { o[campo] = fila[col] ?? ''; });
        if (o.apellidos) o.nombre = `${o.nombre} ${o.apellidos}`.trim();
        o.fecha = fechaIso(o.fecha);
        return o;
      }).filter((f) => f.nombre || f.dni);
      const total = { actualizados: 0, creados: 0, sin_fecha: 0, sin_coincidencia: [], ambiguos: [], detalle: [] };
      for (let i = 0; i < filas.length; i += 90) {
        salida.textContent = `Registrando ${Math.min(i + 90, filas.length)} de ${filas.length}…`;
        const r = await api.post('/api/cumpleanos/importar', { filas: filas.slice(i, i + 90) });
        total.actualizados += r.actualizados; total.creados += r.creados; total.sin_fecha += r.sin_fecha;
        total.sin_coincidencia.push(...r.sin_coincidencia); total.ambiguos.push(...r.ambiguos); total.detalle.push(...r.detalle.filter((x) => x.error));
      }
      salida.innerHTML = html`<p>✅ <strong>${total.actualizados}</strong> cumpleaños registrados${total.creados ? html`, <strong>${total.creados}</strong> personas añadidas al personal` : ''}.</p>
        ${total.detalle.length ? html`<details open><summary>⚠️ ${total.detalle.length} fila(s) con fecha no válida</summary><ul>${total.detalle.slice(0, 30).map((x) => html`<li>Fila ${x.fila}: ${x.nombre} — ${x.error}</li>`)}</ul></details>` : ''}
        ${total.sin_coincidencia.length ? html`<details open><summary>⚠️ ${total.sin_coincidencia.length} no se encontraron en el colegio (revisa el nombre o el DNI)</summary><ul>${total.sin_coincidencia.slice(0, 40).map((x) => html`<li>Fila ${x.fila}: ${x.nombre || x.dni}</li>`)}</ul></details>` : ''}
        ${total.ambiguos.length ? html`<details open><summary>⚠️ ${total.ambiguos.length} con nombre repetido (pon el DNI para distinguirlos)</summary><ul>${total.ambiguos.map((x) => html`<li>Fila ${x.fila}: ${x.nombre}</li>`)}</ul></details>` : ''}`.toString();
      pintarEstado();
    } catch (err) { salida.textContent = `⚠️ ${err.message}`; }
  });

  $('#cu-dni', vista).addEventListener('change', async (e) => {
    const archivos = [...e.target.files].slice(0, 60); e.target.value = '';
    if (!archivos.length) return;
    const filas = [];
    const pintar = () => {
      salida.innerHTML = html`<div class="tabla-caja"><table><thead><tr><th>Nombre en el DNI</th><th>DNI</th><th>Nacimiento</th><th>En el colegio</th><th></th></tr></thead><tbody>
        ${filas.map((f, i) => html`<tr><td>${f.nombre || '—'}</td><td>${f.dni || '—'}</td><td>${f.fecha ? fecha(f.fecha) : '—'}</td>
          <td>${f.error ? html`<span style="color:#b3261e">${f.error}</span>` : f.persona ? html`✅ ${f.persona}` : html`<span style="color:#b3261e">No está registrado: no se guardará</span>`}</td>
          <td><button class="btn" data-q="${i}">Quitar</button></td></tr>`)}</tbody></table></div>
        <p><button class="btn btn-primario" id="cu-guardar">Guardar ${filas.filter((f) => f.persona && f.fecha).length} cumpleaños</button></p>`.toString();
      $$('[data-q]', salida).forEach((b) => b.addEventListener('click', () => { filas.splice(Number(b.dataset.q), 1); pintar(); }));
      $('#cu-guardar', salida)?.addEventListener('click', (ev) => conBoton(ev.target, async () => {
        const validas = filas.filter((f) => f.persona && f.fecha).map((f) => ({ nombre: f.nombre, dni: f.dni, fecha: f.fecha }));
        if (!validas.length) { aviso('No hay nada que guardar', 'error'); return; }
        const r = await api.post('/api/cumpleanos/importar', { filas: validas });
        aviso(`Listo: ${r.actualizados} cumpleaños registrados`); salida.innerHTML = ''; pintarEstado();
      }));
    };
    for (let i = 0; i < archivos.length; i++) {
      salida.textContent = `Leyendo DNI ${i + 1} de ${archivos.length}…`;
      try { filas.push(await api.subir('/api/cumpleanos/dni', await reducirImagen(archivos[i]), 'image/jpeg')); }
      catch (err) { filas.push({ error: err.message }); }
    }
    pintar();
  });
}
