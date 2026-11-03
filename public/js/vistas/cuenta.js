// Mi cuenta: los datos de la persona tal como los registró el colegio, y cerrar sesión.
// Se entra con DNI y celular. Solo dirección, secretaría y contabilidad pueden crear su propia contraseña.
import { api } from '../api.js';
import { html, crudo, aviso, conBoton } from '../ui.js';

export async function mostrar(vista, _, sesion) {
  const u = sesion.usuario;
  const fila = (t, v) => (v ? html`<div><dt>${t}</dt><dd>${v}</dd></div>` : '');
  let hijos = [];
  if (u.rol === 'padre') hijos = await api.get('/api/chat/hijos').catch(() => []);
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Mi cuenta</h1></div></div>
    <section class="tarjeta cuenta-datos"><div class="cuenta-cab"><div class="hijo-ini">${u.nombre[0]}</div>
      <div><strong>${u.nombre}</strong><span class="pequeno">${u.rol_nombre} · ${sesion.colegio.nombre}</span></div></div>
      <dl class="datos">
        ${crudo(fila('DNI', u.dni))}
        ${crudo(fila('Celular', u.telefono ? `+${u.telefono}` : ''))}
        ${crudo(fila('Correo', u.email))}
        ${crudo(fila('Secciones', (u.secciones || []).map((s) => `${s.grado} ${s.seccion}`).join(', ')))}
        ${crudo(fila('Hijos', hijos.map((h) => `${h.nombres.split(' ')[0]} (${h.grado || ''} ${h.seccion || ''})`).join(', ')))}
      </dl>
      <p class="pequeno">Estos datos los registró el colegio. Si alguno está mal, pídele a secretaría que lo corrija.</p>
      <button class="btn btn-peligro" id="cerrar-sesion" type="button">Cerrar sesión</button>
    </section>
    ${u.puede_clave ? crudo(html`<section class="tarjeta"><h2>${u.tiene_clave ? 'Cambiar mi contraseña' : 'Crear mi contraseña'}</h2>
      <p class="pequeno">${u.tiene_clave ? 'Para entrar tendrás que usar tu DNI, tu celular y tu contraseña.' : 'Es opcional. Si la creas, para entrar tendrás que usar tu DNI, tu celular y tu contraseña.'}</p>
      <form class="form" id="f-clave">
        ${u.tiene_clave ? crudo('<label>Contraseña actual<input name="actual" type="password" autocomplete="current-password" required></label>') : ''}
        <label>${u.tiene_clave ? 'Contraseña nueva' : 'Contraseña'}<input name="nueva" type="password" autocomplete="new-password" minlength="8" required placeholder="mín. 8, letras y números"></label>
        <label>Repite la contraseña<input name="otra" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn btn-primario" type="submit">Guardar contraseña</button>
      </form></section>`) : ''}`;
  vista.querySelector('#f-clave')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.nueva !== f.otra) return aviso('Las contraseñas no son iguales', 'error');
    await conBoton(e.target.querySelector('button'), async () => {
      try {
        await api.post('/api/cambiar-clave', { actual: f.actual, nueva: f.nueva });
        aviso('Contraseña guardada');
        mostrar(vista, null, { ...sesion, usuario: { ...u, tiene_clave: true } });
      } catch (er) { aviso(er.message, 'error'); }
    });
  });
  vista.querySelector('#cerrar-sesion').addEventListener('click', async () => {
    await api.post('/api/logout').catch(() => {});
    location.href = '/entrar';
  });
}
