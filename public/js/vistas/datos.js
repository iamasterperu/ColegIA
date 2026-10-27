// Protección de datos (Ley 29733): consentimientos y derechos ARCO.
import { api } from '../api.js';
import { html, crudo, $, fecha, cargando, vacio, aviso, conBoton, modal, telefonoBonito } from '../ui.js';
import { puede, sesion, icono } from '../app.js';

const NOMBRE_FIN = { whatsapp: 'WhatsApp', salud: 'Datos de salud', imagen: 'Uso de imagen' };
const TIPO_ARCO = {
  acceso: 'Acceso: saber qué datos tienen', rectificacion: 'Rectificación: corregir un dato',
  cancelacion: 'Cancelación: borrar mis datos', oposicion: 'Oposición: que dejen de usar un dato',
};
const MEDIO = { web: 'portal', presencial: 'firma en papel', whatsapp: 'WhatsApp', importacion: 'ficha de matrícula' };

export async function mostrar(vista, [pestana]) {
  if (sesion.usuario.rol === 'padre') return vistaPadre(vista);
  const pestanas = [['consentimientos', 'Consentimientos']];
  if (puede('arco.gestionar')) pestanas.push(['arco', 'Solicitudes ARCO']);
  pestanas.push(['guia', 'Cómo cumplimos']);
  const actual = pestanas.some(([k]) => k === pestana) ? pestana : 'consentimientos';
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Protección de datos personales</h1><p>Ley 29733 y su reglamento: consentimientos, derechos ARCO y medidas de seguridad.</p></div>
      <a class="btn" href="/privacidad?c=${sesion.colegio.slug}" target="_blank" rel="noopener">Ver aviso de privacidad</a></div>
    <div class="pestanas">${pestanas.map(([k, t]) => html`<button data-p="${k}" class="${k === actual ? 'activo' : ''}">${t}</button>`)}</div>
    <div id="cuerpo"></div>`;
  $('.pestanas', vista).addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) location.hash = `#/datos/${b.dataset.p}`; });
  const cuerpo = $('#cuerpo', vista);
  if (actual === 'arco') return arcoPersonal(cuerpo);
  if (actual === 'guia') return guia(cuerpo);
  return consentimientosPersonal(cuerpo);
}

async function consentimientosPersonal(caja, finalidad = 'whatsapp', pendientes = false) {
  caja.innerHTML = cargando();
  const d = await api.get(`/api/consentimientos?finalidad=${finalidad}&pendientes=${pendientes ? 1 : 0}`);
  const si = d.filas.filter((f) => f.otorgado === 1).length;
  const no = d.filas.filter((f) => f.otorgado === 0).length;
  caja.innerHTML = html`
    <div class="acciones" style="margin-bottom:12px">
      <div class="modo-chat">${Object.entries(NOMBRE_FIN).map(([k, t]) => html`<button data-fin="${k}" class="${k === finalidad ? 'activo' : ''}">${t}</button>`)}</div>
      <label class="check"><input type="checkbox" id="pend" ${pendientes ? 'checked' : ''}> Solo sin respuesta</label>
      <span class="pequeno">${si} autorizan · ${no} no autorizan · ${d.filas.length - si - no} sin respuesta</span>
    </div>
    <p class="nota-legal">${crudo(icono('escudo'))}<span>${sesion.finalidades[finalidad].texto}</span></p>
    <div class="tabla-caja" style="margin-top:12px"><table>
      <thead><tr><th>Alumno</th><th>Apoderado</th><th>Celular</th><th>Estado</th><th>Registrado</th>${puede('consentimientos.registrar') ? crudo('<th></th>') : ''}</tr></thead>
      <tbody>${d.filas.map((f) => html`<tr>
        <td><a href="#/alumno/${f.alumno_id}">${f.alumno_apellidos}, ${f.alumno_nombres}</a> <span class="pequeno">${f.grado} ${f.seccion}</span></td>
        <td>${f.nombres} ${f.apellidos}</td><td>${telefonoBonito(f.telefono)}</td>
        <td>${f.otorgado === 1 ? crudo('<span class="etiqueta etiqueta-ok">Autoriza</span>') : f.otorgado === 0 ? crudo('<span class="etiqueta etiqueta-peligro">No autoriza</span>') : crudo('<span class="etiqueta etiqueta-alerta">Sin respuesta</span>')}</td>
        <td class="pequeno">${f.creado_en ? `${fecha(f.creado_en)} · ${MEDIO[f.medio] || f.medio}` : '—'}</td>
        ${puede('consentimientos.registrar') ? crudo(html`<td><button class="btn btn-chico" data-reg="${f.alumno_id}:${f.apoderado_id}">Registrar firma</button></td>`) : ''}
      </tr>`)}</tbody></table></div>`;
  caja.querySelectorAll('[data-fin]').forEach((b) => b.addEventListener('click', () => consentimientosPersonal(caja, b.dataset.fin, pendientes)));
  $('#pend', caja).addEventListener('change', (e) => consentimientosPersonal(caja, finalidad, e.target.checked));
  caja.onclick = (e) => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    const [alumno, apoderado] = b.dataset.reg.split(':');
    const { raiz, cerrar } = modal(html`<h2>Registrar consentimiento firmado</h2>
      <p class="pequeno">Úsalo cuando el apoderado firmó el formato en papel. Guarda el documento firmado en el archivo del colegio.</p>
      <p class="nota-legal">${sesion.finalidades[finalidad].texto}</p>
      <div class="acciones" style="margin-top:12px"><button class="btn btn-primario" data-v="1">Autorizó</button><button class="btn btn-peligro" data-v="0">No autorizó</button></div>`, { ancho: 520 });
    raiz.addEventListener('click', async (ev) => {
      const v = ev.target.closest('[data-v]');
      if (!v) return;
      await conBoton(v, async () => {
        await api.post('/api/consentimientos', { alumno_id: alumno, apoderado_id: apoderado, finalidad, otorgado: v.dataset.v === '1' });
        aviso('Consentimiento registrado');
        cerrar();
        consentimientosPersonal(caja, finalidad, pendientes);
      });
    });
  };
}

async function arcoPersonal(caja) {
  caja.innerHTML = cargando();
  const lista = await api.get('/api/arco');
  const dias = (iso) => Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z')) / 86400000);
  caja.innerHTML = lista.length ? html`<div class="tabla-caja"><table>
    <thead><tr><th>Fecha</th><th>Apoderado</th><th>Tipo</th><th>Detalle</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.map((s) => html`<tr>
      <td>${fecha(s.creado_en)}<div class="pequeno">hace ${dias(s.creado_en)} días</div></td>
      <td>${s.nombres} ${s.apellidos}<div class="pequeno">${telefonoBonito(s.telefono)}</div></td>
      <td>${TIPO_ARCO[s.tipo].split(':')[0]}</td><td>${s.detalle}${s.respuesta ? crudo(html`<div class="pequeno"><strong>Respuesta:</strong> ${s.respuesta}</div>`) : ''}</td>
      <td>${s.estado === 'pendiente' ? crudo('<span class="etiqueta etiqueta-alerta">Pendiente</span>') : crudo(html`<span class="etiqueta ${s.estado === 'atendida' ? 'etiqueta-ok' : 'etiqueta-peligro'}">${s.estado}</span>`)}</td>
      <td>${s.estado === 'pendiente' ? crudo(html`<button class="btn btn-chico" data-atender="${s.id}">Responder</button>`) : ''}
        ${s.tipo === 'cancelacion' && sesion.usuario.rol === 'direccion' && s.hijos ? crudo(s.hijos.split('|').map((h) => { const [id, n] = h.split(':'); return html`<a class="btn btn-chico btn-fantasma" href="#/alumno/${id}">Ficha de ${n.split(' ')[0]}</a>`; }).join('')) : ''}</td>
    </tr>`)}</tbody></table></div>
    <p class="pequeno" style="margin-top:10px">Plazos referenciales del reglamento: información 8 días hábiles, acceso 20 días hábiles, rectificación, cancelación y oposición 10 días hábiles. Confírmalos con tu asesor legal.</p>`
    : vacio('No hay solicitudes ARCO.');
  caja.onclick = (e) => {
    const b = e.target.closest('[data-atender]');
    if (!b) return;
    const { raiz, cerrar } = modal(html`<h2>Responder solicitud</h2>
      <form class="form" id="f-arco"><label>Respuesta para el apoderado<textarea name="respuesta" required placeholder="Ej.: Actualizamos su correo el 21/10/2026."></textarea></label>
      <div class="acciones"><button class="btn btn-primario" name="estado" value="atendida">Marcar atendida</button><button class="btn btn-peligro" name="estado" value="rechazada">Rechazar</button></div></form>`, { ancho: 520 });
    $('#f-arco', raiz).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await conBoton(ev.submitter, async () => {
        await api.post(`/api/arco/${b.dataset.atender}/atender`, { estado: ev.submitter.value, respuesta: ev.target.respuesta.value });
        aviso('Solicitud respondida');
        cerrar();
        arcoPersonal(caja);
      });
    });
  };
}

function guia(caja) {
  const c = sesion.colegio;
  const filas = [
    ['Consentimiento previo, informado y expreso', 'Textos versionados por finalidad (WhatsApp, salud, imagen). Cada aceptación o retiro guarda fecha, medio, versión del texto e IP. Los datos de salud no se pueden registrar sin autorización.'],
    ['Menores de edad', 'El consentimiento lo da el padre, madre o apoderado vinculado al alumno.'],
    ['Acceso por rol (necesidad de conocer)', 'Profesores: solo sus secciones y alertas de salud. Contabilidad: pagos. Secretaría: estado de pago sin montos. Padres: solo sus hijos. Lo controla el servidor en cada solicitud.'],
    ['Registro de quién ve qué', 'Cada búsqueda, ficha abierta, audio escuchado, envío y cambio queda en el registro de accesos. Los padres ven quién abrió la ficha de su hijo.'],
    ['Derechos ARCO', 'Los padres envían solicitudes desde el portal y descargan sus datos. Dirección puede anonimizar al alumno (cancelación).'],
    ['Seguridad', 'Contraseñas con PBKDF2, sesión de 8 h en cookie segura, bloqueo tras 5 intentos, tokens de WhatsApp cifrados con AES-GCM, HTTPS y cabeceras de seguridad.'],
    ['Flujo transfronterizo', 'Cloudflare y Meta (WhatsApp) procesan datos fuera del Perú: se informa en el aviso de privacidad y en el texto de autorización.'],
    ['Banco de datos', c.registro_banco_datos ? `Inscripción registrada: ${c.registro_banco_datos}` : 'Pendiente: inscribe el banco de datos "Alumnos y apoderados" ante la Autoridad Nacional de Protección de Datos Personales y anota el número en Ajustes.'],
  ];
  caja.innerHTML = html`<div class="tabla-caja"><table><thead><tr><th>Obligación</th><th>Cómo lo cumple ColegIA</th></tr></thead>
    <tbody>${filas.map(([a, b]) => html`<tr><td><strong>${a}</strong></td><td>${b}</td></tr>`)}</tbody></table></div>
    <p class="pequeno" style="margin-top:10px">Esta guía resume medidas técnicas. No reemplaza la asesoría legal del colegio.</p>`;
}

async function vistaPadre(vista) {
  vista.innerHTML = cargando();
  const [{ hijos }, solicitudes] = await Promise.all([api.get('/api/consentimientos'), api.get('/api/arco')]);
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Mis datos y autorizaciones</h1><p>Decide qué puede hacer el colegio con tus datos y los de tus hijos. Puedes cambiarlo cuando quieras.</p></div>
      <div class="acciones"><a class="btn" href="/privacidad?c=${sesion.colegio.slug}" target="_blank" rel="noopener">Aviso de privacidad</a><button class="btn" id="descargar">Descargar mis datos</button></div></div>
    ${hijos.map((h) => html`<section class="tarjeta"><h2>${h.nombres} ${h.apellidos} <span class="pequeno">${h.grado} ${h.seccion}</span></h2>
      ${Object.entries(sesion.finalidades).map(([k, f]) => {
        const c = h.consentimientos.find((x) => x.finalidad === k);
        return html`<div style="border-top:1px solid var(--borde);padding:12px 0;display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:1;min-width:240px"><strong>${f.titulo}</strong><p class="pequeno" style="margin:4px 0 0">${f.texto}</p>
            <p class="pequeno" style="margin:4px 0 0">${c ? `Última respuesta: ${c.otorgado ? 'autorizado' : 'no autorizado'} el ${fecha(c.creado_en)} (${MEDIO[c.medio] || c.medio})` : 'Aún no respondes.'}</p></div>
          <div class="modo-chat"><button data-c="${h.id}:${k}:1" class="${c?.otorgado === 1 ? 'activo' : ''}">Autorizo</button><button data-c="${h.id}:${k}:0" class="${c?.otorgado === 0 ? 'activo' : ''}">No autorizo</button></div></div>`;
      })}</section>`)}
    <section class="tarjeta"><h2>Ejercer mis derechos (ARCO)</h2>
      <form class="form" id="f-arco">
        <label>¿Qué necesitas?<select name="tipo">${Object.entries(TIPO_ARCO).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
        <label>Detalle<textarea name="detalle" required minlength="10" placeholder="Cuéntanos qué dato y de quién"></textarea></label>
        <button class="btn btn-primario">Enviar solicitud</button>
      </form>
      ${solicitudes.length ? crudo(html`<h3 style="margin-top:16px">Mis solicitudes</h3><ul class="lista-actividad">${solicitudes.map((s) => html`<li><span>${TIPO_ARCO[s.tipo].split(':')[0]} · ${s.detalle.slice(0, 60)}${s.respuesta ? crudo(html`<br><span class="pequeno">Respuesta: ${s.respuesta}</span>`) : ''}</span><span class="etiqueta ${s.estado === 'pendiente' ? 'etiqueta-alerta' : 'etiqueta-ok'}">${s.estado}</span></li>`)}</ul>`) : ''}
    </section>`;

  vista.onclick = async (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const [alumno, finalidad, v] = b.dataset.c.split(':');
    await conBoton(b, async () => {
      await api.post('/api/consentimientos', { alumno_id: alumno, finalidad, otorgado: v === '1' });
      aviso(v === '1' ? 'Autorización registrada' : 'Autorización retirada');
      vistaPadre(vista);
    });
  };
  $('#f-arco', vista).addEventListener('submit', async (e) => {
    e.preventDefault();
    await conBoton($('.btn-primario', e.target), async () => {
      await api.post('/api/arco', Object.fromEntries(new FormData(e.target)));
      aviso('Solicitud enviada. El colegio te responderá dentro del plazo legal.');
      vistaPadre(vista);
    });
  });
  $('#descargar', vista).addEventListener('click', (e) => conBoton(e.target, async () => {
    const datos = await api.get('/api/mis-datos');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(datos instanceof Blob ? datos : new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
    a.download = 'mis-datos-colegia.json';
    a.click();
  }));
}
