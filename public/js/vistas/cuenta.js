import { api } from '../api.js';
import { html, $, aviso, conBoton } from '../ui.js';

export async function mostrar(vista, _, sesion) {
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Mi cuenta</h1><p>${sesion.usuario.nombre} · ${sesion.usuario.email} · ${sesion.usuario.rol_nombre}</p></div></div>
    <section class="tarjeta" style="max-width:460px"><h2>Cambiar contraseña</h2>
      <form class="form" id="f-clave">
        <label>Contraseña actual<input type="password" name="actual" autocomplete="current-password" required></label>
        <label>Nueva contraseña<input type="password" name="nueva" autocomplete="new-password" minlength="8" required></label>
        <p class="pequeno" style="margin:0">Mínimo 8 caracteres, con letras y números. Se cerrarán tus otras sesiones.</p>
        <button class="btn btn-primario">Guardar</button>
      </form></section>`;
  $('#f-clave', vista).addEventListener('submit', async (e) => {
    e.preventDefault();
    await conBoton($('.btn-primario', e.target), async () => {
      await api.post('/api/cambiar-clave', Object.fromEntries(new FormData(e.target)));
      aviso('Contraseña actualizada');
      e.target.reset();
    });
  });
}
