// Ajustes del colegio: identidad, logo y colores, cobranza y conexión a WhatsApp Cloud API.
import { api } from '../api.js';
import { html, crudo, $, aviso, conBoton, cargando } from '../ui.js';
import { aplicarMarca, sesion } from '../app.js';

async function logoADataUrl(archivo) {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const webp = lienzo.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : lienzo.toDataURL('image/png');
}

const PLANTILLA = `Hola {{1}}, le recordamos que la cuota {{3}} de {{2}} por S/ {{4}} vence el {{5}}. Si ya realizó el pago, ignore este mensaje. Responda MENÚ para ver sus opciones.`;
const PLANTILLA_BIENVENIDA = `Hola {{1}}, soy el asistente de WhatsApp de {{2}}. Desde ahora puedes hacer tus consultas de {{3}} por este chat. Responde HOLA para ver todo lo que puedo hacer.`;
const PLANTILLA_AVISO = `Hola {{1}}, el colegio publicó: {{2}}. Responda ÚTILES o MENÚ para recibir la información.`;

export async function mostrar(vista) {
  vista.innerHTML = cargando();
  const c = await api.get('/api/ajustes');
  let logo = c.logo;
  vista.innerHTML = html`
    <div class="encabezado"><div><h1>Ajustes del colegio</h1><p>Código de ingreso: <code>${c.slug}</code></p></div></div>
    <form id="f-ajustes" class="form">
      <section class="tarjeta form"><h2>Identidad</h2>
        <div class="form-fila"><label>Nombre<input name="nombre" value="${c.nombre}" required></label><label>RUC<input name="ruc" value="${c.ruc || ''}" maxlength="11" inputmode="numeric"></label></div>
        <div class="form-fila"><label>Dirección<input name="direccion" value="${c.direccion || ''}"></label><label>Teléfono<input name="telefono" value="${c.telefono || ''}"></label></div>
        <div class="form-fila"><label>Correo para temas de datos personales<input type="email" name="email_privacidad" value="${c.email_privacidad || ''}"></label>
          <label>N.° de inscripción del banco de datos (ANPD)<input name="registro_banco_datos" value="${c.registro_banco_datos || ''}" placeholder="Ej.: RNPDP-PJP N.° 12345"></label></div>
      </section>

      <section class="tarjeta form"><h2>Logo y colores</h2>
        <div class="form-fila">
          <label>Logo (se reduce a 256 px)<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="logo"></label>
          <div><img id="logo-previa" src="${c.logo || ''}" alt="Logo actual" style="max-height:72px;${c.logo ? '' : 'display:none'}"><button type="button" class="btn btn-chico ${c.logo ? '' : 'oculto'}" id="quitar-logo">Quitar logo</button></div>
          <label>Color principal<input type="color" name="color_primario" value="${c.color_primario}"></label>
          <label>Color secundario<input type="color" name="color_secundario" value="${c.color_secundario}"></label>
        </div>
      </section>

      <section class="tarjeta form"><h2>Cobranza</h2>
        <label>Cómo pagar (lo envía el bot cuando preguntan "cómo pago")<textarea name="info_pago">${c.info_pago || ''}</textarea></label>
        <label>Link de pago con tarjeta o Yape (Mercado Pago, Izipay, Niubiz…)<input name="link_pago" type="url" value="${c.link_pago || ''}" placeholder="https://mpago.la/..."></label>
        <label class="check"><input type="checkbox" name="alertas_padres" ${c.alertas_padres ? 'checked' : ''}> Alerta temprana también a los padres (cada lunes, un mensaje amable si su hijo tiene faltas, notas bajas o dificultades)</label>
        <label class="check"><input type="checkbox" name="resumen_diario" ${c.resumen_diario ? 'checked' : ''}> Resumen diario a dirección por WhatsApp (lunes a viernes, 8 a. m.: cobranza, vouchers, faltas, alumnos en riesgo y chats por atender)</label>
        <div class="form-fila">
          <label class="check"><input type="checkbox" name="recordatorio_auto" ${c.recordatorio_auto ? 'checked' : ''}> Enviar recordatorios automáticos cada día desde las 8 a. m.</label>
          <label>Avisar antes del vencimiento (días)<input type="number" name="recordatorio_dias_antes" min="1" max="15" value="${c.recordatorio_dias_antes}"></label>
        </div>
      </section>

      <section class="tarjeta form"><h2>WhatsApp</h2>
        <div class="modo-chat" role="radiogroup" aria-label="Modo de WhatsApp">
          <button type="button" data-modo="simulado" class="${c.wa_modo === 'simulado' ? 'activo' : ''}">Simulado (pruebas)</button>
          <button type="button" data-modo="cloud" class="${c.wa_modo === 'cloud' ? 'activo' : ''}">WhatsApp real (Cloud API)</button>
        </div>
        <input type="hidden" name="wa_modo" value="${c.wa_modo}">
        ${c.master_key_configurada ? '' : crudo('<p class="alerta">Antes de pegar credenciales, configura el secreto <code>MASTER_KEY</code> del Worker (ver README). Sin él, los tokens no se pueden guardar cifrados.</p>')}
        <div class="form-fila">
          <label>Phone number ID<input name="wa_phone_number_id" value="${c.wa_phone_number_id || ''}" placeholder="Ej.: 123456789012345" inputmode="numeric"></label>
          <label>Token de acceso permanente<input name="wa_token" type="password" autocomplete="off" placeholder="${c.wa_tiene_token ? 'Guardado (cifrado). Pega uno nuevo para cambiarlo' : 'EAAG…'}"></label>
          <label>App secret (para validar el webhook)<input name="wa_app_secret" type="password" autocomplete="off" placeholder="${c.wa_tiene_app_secret ? 'Guardado (cifrado)' : 'Clave secreta de la app de Meta'}"></label>
        </div>
        <div class="form-fila">
          <label>URL del webhook (pégala en Meta)<input readonly value="${c.webhook_url}"></label>
          <label>Token de verificación (pégalo en Meta)<input name="wa_verify_token" value="${c.wa_verify_token || ''}"></label>
        </div>
        <div class="form-fila">
          <label>Plantilla de recordatorio<input name="wa_plantilla_recordatorio" value="${c.wa_plantilla_recordatorio || ''}" placeholder="recordatorio_pension"></label>
          <label>Plantilla de avisos<input name="wa_plantilla_aviso" value="${c.wa_plantilla_aviso || ''}" placeholder="aviso_colegio"></label>
          <label>Plantilla de bienvenida<input name="wa_plantilla_bienvenida" value="${c.wa_plantilla_bienvenida || ''}" placeholder="bienvenida_colegia"></label>
          <label>Idioma de plantillas<input name="wa_plantilla_idioma" value="${c.wa_plantilla_idioma || 'es'}"></label>
        </div>
        <label>Números de prueba (opcional; si escribes alguno, en modo real solo se envía a ellos)<input name="wa_numeros_prueba" value="${c.wa_numeros_prueba || ''}" placeholder="987654321, 912345678"></label>
        <label class="check"><input type="checkbox" name="portal_padres" ${c.portal_padres ? 'checked' : ''}> Permitir que los padres también entren a la web (por defecto se atienden solo por WhatsApp)</label>
        <div class="acciones">
          <button type="button" class="btn" id="probar" ${c.wa_tiene_token ? '' : 'disabled'}>Probar conexión</button>
          ${c.wa_tiene_token ? crudo('<label class="check"><input type="checkbox" name="borrar_credenciales"> Borrar credenciales guardadas</label>') : ''}
          <span class="pequeno">Transcripción de audios reales: ${c.ai_configurada ? 'Workers AI activo' : 'desactivada (ver README)'}</span>
        </div>
        <details><summary><strong>Paso a paso para conectar WhatsApp Cloud API</strong></summary>
          <ol class="pequeno">
            <li>Entra a developers.facebook.com → <em>Mis apps</em> → <em>Crear app</em> → tipo <em>Empresa</em> → agrega el producto <strong>WhatsApp</strong>.</li>
            <li>En <em>WhatsApp → Configuración de la API</em> copia el <strong>Phone number ID</strong> y pégalo arriba.</li>
            <li>Crea un <strong>usuario del sistema</strong> en business.facebook.com → <em>Configuración del negocio</em>, dale acceso a la app y genera un token permanente con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code>. Pégalo en "Token de acceso".</li>
            <li>En <em>Configuración de la app → Básica</em> copia la <strong>Clave secreta de la app</strong> y pégala en "App secret".</li>
            <li>En <em>WhatsApp → Configuración → Webhook</em> pega la URL del webhook y el token de verificación de arriba. Suscríbete al campo <code>messages</code>.</li>
            <li>En <em>Administrador de WhatsApp → Plantillas</em> crea dos plantillas de categoría <strong>Utilidad</strong> en español:
              <br><code>recordatorio_pension</code>: “${PLANTILLA}”
              <br><code>aviso_colegio</code>: “${PLANTILLA_AVISO}”
              <br><code>bienvenida_colegia</code>: “${PLANTILLA_BIENVENIDA}”</li>
            <li>Guarda, elige <strong>WhatsApp real</strong>, escribe tu número en "Números de prueba" y usa <em>Probar conexión</em>. Cuando todo funcione, borra los números de prueba.</li>
          </ol>
        </details>
      </section>
      <div class="acciones"><button class="btn btn-primario">Guardar ajustes</button></div>
    </form>`;

  const form = $('#f-ajustes', vista);
  form.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
    form.wa_modo.value = b.dataset.modo;
    form.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('activo', x === b));
  }));
  $('#logo', vista).addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    logo = archivo.type === 'image/svg+xml' && archivo.size < 60000
      ? await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(archivo); })
      : await logoADataUrl(archivo);
    const img = $('#logo-previa', vista);
    img.src = logo;
    img.style.display = '';
    $('#quitar-logo', vista).classList.remove('oculto');
  });
  $('#quitar-logo', vista).addEventListener('click', (e) => { logo = null; $('#logo-previa', vista).style.display = 'none'; e.target.classList.add('oculto'); });
  $('#probar', vista).addEventListener('click', (e) => conBoton(e.target, async () => {
    const r = await api.post('/api/ajustes/probar-whatsapp');
    aviso(`Conexión correcta: ${r.nombre || ''} ${r.numero || ''} (calidad ${r.calidad || 'sin dato'})`);
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    delete datos.logo;
    datos.logo = logo;
    datos.recordatorio_auto = form.recordatorio_auto.checked;
    datos.portal_padres = form.portal_padres.checked;
    datos.alertas_padres = form.alertas_padres.checked;
    datos.resumen_diario = form.resumen_diario.checked;
    datos.borrar_credenciales = !!form.borrar_credenciales?.checked;
    if (!datos.wa_token) delete datos.wa_token;
    if (!datos.wa_app_secret) delete datos.wa_app_secret;
    await conBoton($('.btn-primario', form), async () => {
      await api.put('/api/ajustes', datos);
      Object.assign(sesion.colegio, { nombre: datos.nombre, logo, color_primario: datos.color_primario, color_secundario: datos.color_secundario, wa_modo: datos.wa_modo });
      aplicarMarca(sesion.colegio);
      aviso('Ajustes guardados');
      mostrar(vista);
    });
  });
}
