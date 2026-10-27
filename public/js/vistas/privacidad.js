// Aviso de privacidad público de cada colegio: /privacidad?c=<código>
import { api } from '../api.js';
import { html, crudo } from '../ui.js';
import { aplicarMarca } from '../app.js';

export async function mostrar(raiz) {
  const slug = new URLSearchParams(location.search).get('c') || '';
  let c;
  try {
    c = await api.get(`/api/publico/colegio/${encodeURIComponent(slug)}`);
  } catch {
    raiz.innerHTML = html`<main class="legal"><h1>Aviso de privacidad</h1><p>No encontramos el colegio “${slug}”.</p></main>`;
    return;
  }
  aplicarMarca(c);
  document.title = `Aviso de privacidad · ${c.nombre}`;
  raiz.innerHTML = html`<main class="legal">
    <p><a href="/?c=${c.slug}">← Volver</a></p>
    <h1>Aviso de privacidad de ${c.nombre}</h1>
    <p>En cumplimiento de la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento, te informamos cómo tratamos tus datos y los de tus hijos.</p>

    <h2>1. Quién es responsable</h2>
    <p><strong>${c.nombre}</strong>${c.ruc ? `, RUC ${c.ruc}` : ''}${c.direccion ? `, con domicilio en ${c.direccion}` : ''}. Banco de datos: “Alumnos y apoderados”${c.registro_banco_datos ? `, inscrito con ${c.registro_banco_datos}` : ''}. Contacto: ${c.email_privacidad || 'secretaría del colegio'}.</p>

    <h2>2. Qué datos tratamos</h2>
    <ul>
      <li>Del alumno: nombres, código, DNI, fecha de nacimiento, grado y sección, notas, asistencia y pagos.</li>
      <li>Del apoderado: nombres, DNI, celular, correo y parentesco.</li>
      <li>Datos sensibles de salud (alergias, condiciones, seguro, contacto de emergencia), <strong>solo si los autorizas</strong>.</li>
      <li>Mensajes y notas de voz que envíes al WhatsApp del colegio.</li>
      <li>Registro de accesos: quién consultó qué dato y cuándo, para tu seguridad.</li>
    </ul>

    <h2>3. Para qué los usamos</h2>
    <ul>
      <li><strong>Prestar el servicio educativo</strong> (matrícula, evaluación, asistencia, cobranza). Es necesario para el contrato y no requiere consentimiento adicional.</li>
      ${Object.values(c.finalidades).map((f) => html`<li><strong>${f.titulo}</strong> (requiere tu autorización, versión ${f.version}): ${f.texto}</li>`)}
    </ul>
    <p>Puedes dar o retirar cada autorización en el portal (<em>Protección de datos</em>), en secretaría o escribiendo BAJA al WhatsApp del colegio. Retirarla no afecta la matrícula.</p>

    <h2>4. Quién más accede (encargados)</h2>
    <ul>
      <li><strong>Cloudflare, Inc.</strong>: aloja la aplicación y la base de datos.</li>
      <li><strong>Meta Platforms (WhatsApp)</strong>: transmite los mensajes, solo si autorizaste ese canal.</li>
    </ul>
    <p>Estos proveedores tienen servidores fuera del Perú, por lo que hay <strong>flujo transfronterizo</strong> de datos. Las fotos de listas de útiles se leen en el equipo de quien las carga y no se envían a terceros.</p>

    <h2>5. Quién ve los datos dentro del colegio</h2>
    <p>Cada persona ve solo lo que necesita: los profesores, a los alumnos de sus secciones; contabilidad, los pagos; los padres, solo a sus hijos. Cada consulta queda registrada y puedes ver quién abrió la ficha de tu hijo.</p>

    <h2>6. Cuánto tiempo los guardamos</h2>
    <p>Mientras el alumno esté matriculado y luego por los plazos que exigen las normas educativas y tributarias. Después se eliminan o anonimizan.</p>

    <h2>7. Tus derechos</h2>
    <p>Puedes ejercer tus derechos de <strong>información, acceso, rectificación, cancelación y oposición (ARCO)</strong> desde el portal (<em>Protección de datos → Ejercer mis derechos</em>)${c.email_privacidad ? `, o escribiendo a ${c.email_privacidad}` : ''}. Si no recibes respuesta en el plazo legal, puedes reclamar ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.</p>

    <h2>8. Seguridad</h2>
    <p>Usamos conexión cifrada (HTTPS), contraseñas protegidas, sesiones que vencen, bloqueo ante intentos fallidos, cifrado de credenciales y el registro de accesos descrito arriba.</p>
    ${c.es_demo ? crudo('<p class="alerta">Este es un colegio de demostración con datos ficticios.</p>') : ''}
  </main>`;
}
