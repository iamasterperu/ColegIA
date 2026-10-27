// Usuarios y roles del colegio (solo dirección).
import { api } from '../api.js';
import { html, crudo, $, fecha, cargando, aviso, conBoton, modal, ROL_NOMBRE } from '../ui.js';

const DESCRIPCION = {
  direccion: 'Todo el colegio: panel, ajustes, usuarios y registro de accesos.',
  contabilidad: 'Pagos, recordatorios y datos de contacto. No ve notas ni salud.',
  secretaria: 'Alumnos, útiles, WhatsApp y consentimientos. Ve si hay deuda, no los montos.',
  profesor: 'Solo los alumnos de sus secciones: notas, asistencia y alertas de salud.',
  padre: 'Solo sus hijos: ficha, pagos, útiles, autorizaciones y solicitudes ARCO.',
};

export async function mostrar(vista) {
  vista.innerHTML = cargando();
  const usuarios = await api.get('/api/usuarios');
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Usuarios y roles</h1><p>Cada persona entra con su propio usuario: así el registro de accesos sabe quién vio qué.</p></div>
      <div class="acciones"><a class="btn" href="#/importar/personal">Importar personal (Excel)</a><button class="btn" id="bienvenida-personal">Enviar bienvenida al personal</button><button class="btn" id="bienvenida-padres">Enviar bienvenida a los padres</button><button class="btn btn-primario" id="nuevo">+ Nuevo usuario</button></div></div>
    <p class="nota-legal" style="margin-bottom:12px">Con el celular registrado, cada persona usa el asistente de WhatsApp con el menú de su rol. "Bienvenida" le envía ese menú por WhatsApp. Los padres se identifican por el celular que figura como apoderado.</p>
    <div class="tabla-caja"><table>
      <thead><tr><th>Nombre</th><th>Correo</th><th>Celular (WhatsApp)</th><th>Rol</th><th>Secciones</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead>
      <tbody>${usuarios.map((u) => html`<tr>
        <td>${u.nombre}</td><td>${u.email}</td><td>${u.telefono ? `+${u.telefono}` : '—'}</td><td title="${DESCRIPCION[u.rol]}">${ROL_NOMBRE[u.rol]}</td><td>${u.secciones || ''}</td>
        <td>${u.ultimo_acceso ? fecha(u.ultimo_acceso, true) : 'Nunca'}</td>
        <td>${u.activo ? crudo('<span class="etiqueta etiqueta-ok">Activo</span>') : crudo('<span class="etiqueta">Inactivo</span>')}</td>
        <td><div class="acciones" style="flex-wrap:nowrap"><button class="btn btn-chico" data-editar="${u.id}">Editar</button>${u.telefono && u.rol !== 'padre' && u.activo ? crudo(html`<button class="btn btn-chico" data-bienvenida="${u.id}">Bienvenida</button>`) : ''}</div></td></tr>`)}</tbody></table></div>
    <section class="tarjeta" style="margin-top:16px"><h2>Qué ve cada rol</h2>
      <dl class="datos">${Object.entries(DESCRIPCION).map(([k, t]) => html`<div><dt>${ROL_NOMBRE[k]}</dt><dd>${t}</dd></div>`)}</dl></section>`;

  $('#nuevo', vista).addEventListener('click', () => {
    const { raiz, cerrar } = modal(html`<h2>Nuevo usuario</h2>
      <form class="form" id="f-u">
        <div class="form-fila"><label>Nombre<input name="nombre" required></label><label>Correo<input type="email" name="email" required></label></div>
        <div class="form-fila"><label>Rol<select name="rol">${Object.entries(ROL_NOMBRE).filter(([k]) => k !== 'sistema').map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
          <label>Contraseña temporal<input name="clave" required minlength="8" placeholder="mín. 8, letras y números"></label></div>
        <label class="extra-cel">Celular para WhatsApp<input name="telefono" inputmode="tel" placeholder="987 654 321"></label>
        <label class="extra" data-rol="profesor">Secciones (separadas por coma)<input name="secciones" placeholder="3° Primaria A, 3° Primaria B"></label>
        <label class="extra" data-rol="padre">DNI del apoderado registrado<input name="apoderado_dni" inputmode="numeric"></label>
        <p class="pequeno" id="desc-rol"></p>
        <button class="btn btn-primario">Crear usuario</button>
      </form>`, { ancho: 600 });
    const form = $('#f-u', raiz);
    const actualizar = () => {
      raiz.querySelectorAll('.extra').forEach((x) => x.classList.toggle('oculto', x.dataset.rol !== form.rol.value));
      $('.extra-cel', raiz).classList.toggle('oculto', form.rol.value === 'padre');
      $('#desc-rol', raiz).textContent = DESCRIPCION[form.rol.value];
    };
    form.rol.addEventListener('change', actualizar);
    actualizar();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await conBoton($('.btn-primario', form), async () => {
        await api.post('/api/usuarios', Object.fromEntries(new FormData(form)));
        aviso('Usuario creado. Entrégale su contraseña temporal en persona.');
        cerrar();
        mostrar(vista);
      });
    });
  });

  $('#bienvenida-personal', vista).addEventListener('click', (e) => confirm('¿Enviar a todo el personal activo con celular el menú del asistente por WhatsApp?') && conBoton(e.target, async () => {
    let ok = 0;
    for (const u of usuarios.filter((x) => x.telefono && x.rol !== 'padre' && x.activo)) {
      const r = await api.post('/api/whatsapp/bienvenida', { usuario_id: u.id });
      if (r.estado !== 'error') ok++;
    }
    aviso(`Bienvenida enviada a ${ok} persona(s) del personal`);
  }));

  $('#bienvenida-padres', vista).addEventListener('click', (e) => confirm('¿Enviar el mensaje de bienvenida del asistente a todos los padres con celular? Se envía por tandas durante el día y solo una vez por persona.') && conBoton(e.target, async () => {
    const r = await api.post('/api/whatsapp/bienvenida', { padres: true });
    aviso(r.encolados ? `Bienvenida en camino a ${r.encolados} apoderados` : 'Todos los apoderados ya recibieron la bienvenida');
  }));

  vista.onclick = async (e) => {
    const bv = e.target.closest('[data-bienvenida]');
    if (bv) {
      await conBoton(bv, async () => {
        const r = await api.post('/api/whatsapp/bienvenida', { usuario_id: bv.dataset.bienvenida });
        aviso(r.estado === 'error' ? `WhatsApp no lo entregó: ${r.error}` : r.canal === 'cloud' ? 'Bienvenida enviada por WhatsApp' : 'Bienvenida enviada (modo simulado: mírala en el chat de prueba)', r.estado === 'error' ? 'error' : 'ok');
      });
      return;
    }
    const b = e.target.closest('[data-editar]');
    if (!b) return;
    const u = usuarios.find((x) => x.id === Number(b.dataset.editar));
    const { raiz, cerrar } = modal(html`<h2>${u.nombre}</h2><p class="pequeno">${ROL_NOMBRE[u.rol]} · ${u.email}</p>
      <form class="form" id="f-e">
        <label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>
        ${u.rol !== 'padre' ? crudo(html`<label>Celular para WhatsApp<input name="telefono" value="${u.telefono || ''}" inputmode="tel"></label>`) : ''}
        ${u.rol === 'profesor' ? crudo(html`<label>Secciones<input name="secciones" value="${u.secciones || ''}"></label>`) : ''}
        <label>Nueva contraseña (opcional)<input name="clave" minlength="8" autocomplete="new-password"></label>
        <button class="btn btn-primario">Guardar</button>
      </form>`, { ancho: 480 });
    $('#f-e', raiz).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const datos = { activo: f.activo.checked };
      if (f.clave.value) datos.clave = f.clave.value;
      if (f.secciones) datos.secciones = f.secciones.value;
      if (f.telefono) datos.telefono = f.telefono.value;
      await conBoton($('.btn-primario', f), async () => {
        await api.put(`/api/usuarios/${u.id}`, datos);
        aviso('Usuario actualizado');
        cerrar();
        mostrar(vista);
      });
    });
  };
}
