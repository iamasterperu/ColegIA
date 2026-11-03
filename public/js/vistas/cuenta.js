// Mi cuenta: los datos de la persona tal como los registró el colegio, y cerrar sesión.
// No hay contraseña que cambiar: se entra con DNI y celular desde este celular.
import { api } from '../api.js';
import { html, crudo } from '../ui.js';

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
    </section>`;
  vista.querySelector('#cerrar-sesion').addEventListener('click', async () => {
    await api.post('/api/logout').catch(() => {});
    location.href = '/entrar';
  });
}
