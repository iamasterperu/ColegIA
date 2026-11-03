// «Mi panel»: la pestaña de control de cada persona. Muestra solo lo que su rol puede manejar:
// dirección, secretaría, contabilidad, profesores y familias ven cada uno su propio panel.
import { html, crudo } from '../ui.js';
import { MENU, icono, puede, sesion } from '../app.js';

const SALUDO = {
  direccion: 'Panel de dirección: todo el colegio en un solo lugar.',
  secretaria: 'Panel de secretaría: matrícula, avisos, admisión y trámites.',
  contabilidad: 'Panel de contabilidad: pagos, vouchers y comprobantes.',
  profesor: 'Panel del profesor: tus aulas, asistencia, exámenes y sesiones.',
  padre: 'Panel de familia: tus hijos, pagos, útiles y autorizaciones.',
};

export async function mostrar(vista) {
  const items = MENU.filter((m) => m.ruta !== 'chat' && (m.permiso ? puede(m.permiso) : m.ver ? m.ver(sesion) : true));
  vista.innerHTML = html`
    <h2 class="panel-titulo">Hola, ${sesion.usuario.nombre.split(' ')[0]}</h2>
    <p class="panel-sub">${SALUDO[sesion.usuario.rol] || ''}</p>
    <div class="panel-grid">
      ${items.map((m) => html`<a class="panel-tile" href="#/${m.ruta}">${crudo(icono(m.icono))}<span>${m.texto}</span></a>`)}
    </div>`;
}
