// Agente de WhatsApp del colegio. Atiende igual el chat de prueba (modo simulado) y los
// mensajes reales del webhook de Cloud API: identifica quién escribe, interpreta el
// mensaje (texto, audio, foto o archivo) según su rol y responde con datos de la base.
import { normalizar } from '../lib/texto.js';
import { FINALIDADES } from '../lib/consentimiento.js';
import { enviar, cargarConexion } from './envio.js';
import { interpretar, porReglas } from './interpretar.js';
import {
  identificar, leerPendiente, guardarPendiente, borrarPendiente, ROLES_DEMO, NOMBRE_ROL, procesarCola, auditoria,
} from './comun.js';
import { responderPadre, menuPadre, hijosDe, tieneConsentimiento, registrarConsentimientoWa, voucherPadre } from './roles/padre.js';
import { responderPersonal, menuPersonal, ejecutarConfirmada, gradoEn } from './roles/personal.js';
import { responderAlumno, menuAlumno } from './roles/alumno.js';
import { registrarEntregas } from './roles/docente.js';
import { notasPorFoto } from './roles/registro.js';
import { cargaImagen, cargaExcel, confirmarUtiles } from './roles/carga.js';
import { leerImagen, hayIA } from '../ia/modelo.js';

const menuDe = (persona, colegio) => (persona.rol === 'padre' ? menuPadre(persona, colegio)
  : persona.rol === 'alumno' ? menuAlumno(persona, colegio) : menuPersonal(persona, colegio));

const introDemo = (colegio) =>
  `👋 ¡Hola! Esta es la demostración de *ColegIA*, el asistente de WhatsApp de *${colegio.nombre}*.\n\n` +
  'Todo el colegio usa este mismo número y cada persona recibe su propio menú. Escribe con qué rol quieres probar:\n' +
  '• *DIRECTORA* — resumen, morosidad por aula, alertas, comunicados\n' +
  '• *PROFESOR* — exámenes A/B con solucionario, sesiones, radar, faltas\n' +
  '• *CONTADORA* — cobranza, vouchers, registrar pagos\n' +
  '• *SECRETARIA* — fotos de listas y fichas, avisos, bandeja\n' +
  '• *PADRE* — pagos, notas, útiles que faltan, justificar faltas\n' +
  '• *ALUMNO* — tutor de IA que no da la respuesta\n\n' +
  'Para cambiar después, escribe *CAMBIAR ROL*. Los datos son ficticios.';

/**
 * entrada: { telefono, texto, tipo: 'texto'|'audio'|'imagen'|'documento', transcripcion,
 *            audio|imagen|documento: { mime, datos, nombre? }, waId, origen }
 * Devuelve las respuestas enviadas: [{ id, canal, estado, error, texto }]
 */
export async function procesarEntrante(env, conexion, entrada) {
  const colegio = conexion.colegio;
  const tel = entrada.telefono;
  let persona = await identificar(env, colegio, tel);
  const origen = entrada.origen || env.URL_BASE || '';

  const textoGuardado = entrada.tipo === 'imagen' ? `[📷 foto] ${entrada.texto || ''}`.trim()
    : entrada.tipo === 'documento' ? `[📎 ${entrada.documento?.nombre || 'archivo'}] ${entrada.texto || ''}`.trim() : entrada.texto ?? null;
  const fila = await env.DB.prepare(
    `INSERT INTO mensajes (colegio_id, telefono, apoderado_id, usuario_id, sentido, tipo, texto, transcripcion, canal, motivo, wa_message_id)
     VALUES (?, ?, ?, ?, 'entrante', ?, ?, ?, ?, 'bot', ?) ON CONFLICT DO NOTHING RETURNING id`,
  ).bind(colegio.id, tel, persona?.apoderado?.id ?? null, persona?.usuario?.id ?? null, entrada.tipo === 'audio' ? 'audio' : 'texto',
    textoGuardado, entrada.transcripcion ?? null, conexion.modo === 'cloud' && entrada.waId ? 'cloud' : 'simulado', entrada.waId ?? null).first();
  if (!fila) return []; // WhatsApp reintentó un mensaje ya procesado
  if (entrada.audio) {
    await env.DB.prepare('INSERT INTO mensajes_audio (mensaje_id, mime, datos) VALUES (?, ?, ?)').bind(fila.id, entrada.audio.mime, entrada.audio.datos).run();
  }

  const salidas = [];
  const responder = async (texto, { porAtender = false, motivo = 'bot', documento = null } = {}) => {
    if (porAtender) await env.DB.prepare("UPDATE mensajes SET estado = 'por_atender', motivo = ? WHERE id = ?").bind(motivo, fila.id).run();
    const r = await enviar(env, conexion, {
      telefono: tel, apoderadoId: persona?.apoderado?.id, usuarioId: persona?.usuario?.id, texto, motivo: 'bot', respuesta: true, documento,
    });
    salidas.push({ ...r, texto });
    return salidas;
  };
  // Mensajes que el agente manda a otra persona (constancia al padre, justificación al tutor, voucher a contabilidad)
  const notificar = (destino, texto, motivo = 'aviso') => enviar(env, conexion, {
    // Un apoderado trae "nombres"; un usuario del personal, "nombre"
    telefono: destino.telefono, apoderadoId: destino.nombres ? destino.id : null, usuarioId: destino.nombres ? null : destino.id,
    texto, motivo, plantilla: colegio.wa_plantilla_aviso ? { nombre: colegio.wa_plantilla_aviso, parametros: [(destino.nombres || destino.nombre || '').split(' ')[0] || 'familia', texto] } : null,
  });
  const enviarCola = (n) => procesarCola(env, n, (e, c) => (c.id === colegio.id ? conexion : cargarConexion(e, c)));

  const texto = (entrada.tipo === 'audio' ? entrada.transcripcion : entrada.texto) || '';
  const t = normalizar(texto);

  // ---- Colegio demo: el celular elige un rol ----
  if (colegio.es_demo) {
    const pedido = t.match(/^(?:soy (?:el |la |un |una )?|modo |probar como |rol )?(padre|mama|apoderado|profesor|profesora|docente|contador|contadora|contabilidad|secretaria|director|directora|direccion|alumno|alumna|estudiante)$/);
    if (pedido) {
      await env.DB.prepare(
        `INSERT INTO wa_identidad_demo (colegio_id, telefono, rol) VALUES (?, ?, ?)
         ON CONFLICT(colegio_id, telefono) DO UPDATE SET rol = excluded.rol, creado_en = datetime('now')`,
      ).bind(colegio.id, tel, ROLES_DEMO[pedido[1]]).run();
      await borrarPendiente(env, colegio, tel);
      persona = await identificar(env, colegio, tel);
      return responder(`🎭 Ahora eres *${NOMBRE_ROL[persona.rol]}* en la demo (${persona.usuario.nombre}).\n\n${menuDe(persona, colegio)}`);
    }
    if (/^(cambiar rol|demo|salir demo)$/.test(t)) {
      await env.DB.prepare('DELETE FROM wa_identidad_demo WHERE colegio_id = ? AND telefono = ?').bind(colegio.id, tel).run();
      return responder(introDemo(colegio));
    }
    if (!persona) return responder(introDemo(colegio));
  }

  if (!persona) {
    return responder(`Hola 👋. Este número no está registrado en *${colegio.nombre}*. Por seguridad solo damos información a padres, alumnos y personal registrados. Acércate a secretaría para registrar tu número.`, { porAtender: true });
  }
  if (entrada.tipo === 'audio' && !texto) {
    return responder('🎧 Recibimos tu audio. Una persona del colegio lo escuchará y te responderá pronto.', { porAtender: true });
  }

  // ---- Alumno: tutor IA (requiere autorización del apoderado) ----
  if (persona.rol === 'alumno') {
    if (!persona.autorizado) return responder(`Hola ${persona.nombre} 👋. Para usar el tutor de IA, tu papá, mamá o apoderado debe activarlo escribiendo "tutor" a este número.`);
    const r = await responderAlumno(env, colegio, persona, { texto, imagen: entrada.imagen, telefono: tel });
    return responder(r.texto);
  }

  // ---- Autorización del padre (Ley 29733) antes de dar datos ----
  if (persona.rol === 'padre') {
    const r = porReglas('padre', texto);
    const hijos = await hijosDe(env, persona.apoderado.id);
    if (/^baja tutor/.test(t)) {
      await env.DB.batch(hijos.map((h) => env.DB.prepare(
        "INSERT INTO consentimientos (colegio_id, apoderado_id, alumno_id, finalidad, otorgado, version_texto, medio) VALUES (?, ?, ?, 'tutor_ia', 0, ?, 'whatsapp')",
      ).bind(colegio.id, persona.apoderado.id, h.id, FINALIDADES.tutor_ia.version)));
      return responder('Listo, desactivamos el tutor de IA para tus hijos.');
    }
    if (r.intencion === 'baja') {
      await registrarConsentimientoWa(env, colegio, persona.apoderado.id, hijos, false);
      return responder('Listo, ya no te enviaremos mensajes por WhatsApp. Si cambias de opinión, escribe *ACEPTO*.');
    }
    if (r.intencion === 'acepto') {
      await registrarConsentimientoWa(env, colegio, persona.apoderado.id, hijos, true);
      return responder('✅ Gracias, registramos tu autorización.\n\n' + menuPadre(persona, colegio));
    }
    if (!(await tieneConsentimiento(env, persona.apoderado.id))) {
      const aviso = origen ? `\nAviso de privacidad: ${origen}/privacidad?c=${colegio.slug}` : '';
      return responder(`Hola ${persona.nombre}, soy el asistente de *${colegio.nombre}*. Para darte información de tu hijo(a) por WhatsApp necesitamos tu autorización (Ley 29733).\n\n${FINALIDADES.whatsapp.texto.replaceAll('{colegio}', colegio.nombre)}${aviso}\n\nResponde *ACEPTO* para autorizar.`);
    }
    // Foto del voucher
    if (entrada.imagen) {
      const avisarContabilidad = async (reportadoId, aviso, pendientePago) => {
        const { results } = await env.DB.prepare("SELECT id, nombre, telefono FROM usuarios WHERE colegio_id = ? AND rol = 'contabilidad' AND activo = 1 AND telefono IS NOT NULL")
          .bind(colegio.id).all();
        for (const u of results) {
          await notificar(u, aviso, 'voucher');
          if (pendientePago) await guardarPendiente(env, colegio, u.telefono, 'confirmar', { tipo: 'pago', ...pendientePago });
        }
      };
      const r2 = await voucherPadre(env, colegio, persona, entrada.imagen, avisarContabilidad);
      await auditoria(env, colegio, persona, 'enviar_voucher').run();
      return responder(r2.texto, { porAtender: r2.porAtender });
    }
  }

  // ---- Personal: fotos y archivos ----
  if (persona.rol !== 'padre' && (entrada.imagen || entrada.documento)) {
    const intencion = porReglas(persona.rol, texto).intencion;
    if (entrada.documento) {
      if (!['secretaria', 'direccion'].includes(persona.rol)) return responder('Puedo recibir archivos Excel de secretaría o dirección.');
      const r = await cargaExcel(env, colegio, persona, entrada.documento);
      if (r.pendiente) await guardarPendiente(env, colegio, tel, r.pendiente.accion, r.pendiente.datos);
      return responder(r.texto);
    }
    if (['secretaria', 'direccion'].includes(persona.rol) && !['examen', 'sesion', 'adaptar'].includes(intencion)) {
      try {
        const r = await cargaImagen(env, colegio, persona, entrada.imagen, texto);
        if (r.pendiente) await guardarPendiente(env, colegio, tel, r.pendiente.accion, r.pendiente.datos);
        return responder(r.texto);
      } catch {
        return responder('No pude leer bien la foto. Intenta con una foto de frente, nítida y con buena luz.');
      }
    }
    if ((persona.rol === 'profesor' || persona.rol === 'direccion') && /\b(nota|notas|registro)\b/i.test(texto)) {
      try {
        const r = await notasPorFoto(env, colegio, persona, entrada.imagen, texto);
        if (r.pendiente) await guardarPendiente(env, colegio, tel, r.pendiente.accion, r.pendiente.datos);
        return responder(r.texto);
      } catch {
        return responder('No pude leer bien el registro. Intenta con una foto de frente, nítida y con buena luz.');
      }
    }
    if (persona.rol === 'profesor' || persona.rol === 'direccion') {
      if (!hayIA(env)) return responder('No puedo leer fotos en este momento.');
      let fuente;
      try {
        fuente = await leerImagen(env, entrada.imagen, 'Transcribe el contenido educativo de esta imagen (página de libro, sílabo, ficha o pizarra) de forma ordenada. Solo el texto.', { maxTokens: 1500 });
      } catch {
        return responder('No pude leer bien la foto. Intenta con una foto de frente y con buena luz.');
      }
      if (['examen', 'sesion', 'adaptar'].includes(intencion)) {
        entrada.fuente = fuente;
      } else {
        await guardarPendiente(env, colegio, tel, 'fuente', { texto: fuente.slice(0, 4000) });
        return responder(`📖 Leí la foto:\n"${fuente.slice(0, 300)}…"\n\n¿Qué preparo con esto? Por ejemplo: *examen de 10 preguntas para 2° de secundaria*, *sesión de 90 minutos* o *adaptar para un alumno con dislexia*.`);
      }
    } else {
      return responder('Recibí tu foto. Para este rol escríbeme lo que necesitas o escribe *MENÚ*.');
    }
  }

  // ---- ¿Esperábamos una respuesta? (confirmación, elección, un dato, útiles o una foto) ----
  let interpretado = null;
  let fuente = entrada.fuente || null;
  const pendiente = await leerPendiente(env, colegio, tel);
  if (pendiente) {
    const r = porReglas(persona.rol, texto);
    if (pendiente.accion === 'confirmar') {
      await borrarPendiente(env, colegio, tel);
      if (r.intencion === 'si') {
        return responder(await ejecutarConfirmada(env, colegio, persona, pendiente.datos, { notificar, enviarCola }));
      }
      if (r.intencion === 'no') return responder('Cancelado. ¿Te ayudo con algo más? Escribe *MENÚ*.');
    } else if (pendiente.accion === 'elegir') {
      const n = Number(t);
      const codigo = texto.match(/\b([A-Za-z]{2}\d{4})\b/)?.[1];
      if (n >= 1 && n <= pendiente.datos.ids.length) {
        interpretado = { intencion: pendiente.datos.intencion, alumnoId: pendiente.datos.ids[n - 1], extra: pendiente.datos.extra, consulta: '' };
      } else if (codigo) {
        interpretado = { intencion: pendiente.datos.intencion, consulta: codigo, extra: pendiente.datos.extra };
      }
      await borrarPendiente(env, colegio, tel);
    } else if (pendiente.accion === 'entregas') {
      const r2 = await registrarEntregas(env, colegio, persona, pendiente.datos, texto);
      if (r2) { await borrarPendiente(env, colegio, tel); return responder(r2.texto); }
    } else if (pendiente.accion === 'grado_utiles') {
      const grado = await gradoEn(env, colegio, texto);
      if (grado) {
        const c = confirmarUtiles(grado, pendiente.datos.items);
        await guardarPendiente(env, colegio, tel, c.pendiente.accion, c.pendiente.datos);
        return responder(c.texto);
      }
    } else if (pendiente.accion === 'fuente') {
      fuente = pendiente.datos.texto;
      await borrarPendiente(env, colegio, tel);
    } else if (pendiente.accion === 'pedir' && !['menu', 'no', 'gracias'].includes(r.intencion)) {
      await borrarPendiente(env, colegio, tel);
      interpretado = { intencion: pendiente.datos.intencion, consulta: texto, extra: pendiente.datos.extra };
    }
  }
  interpretado ||= await interpretar(env, persona.rol, texto);
  const contexto = {
    ...interpretado, consulta: interpretado.consulta ?? '', texto, origen, fuente,
    avisarYa: (aviso) => responder(aviso),
  };

  let resultado;
  if (persona.rol === 'padre') {
    contexto.avisarTutor = (tutor, aviso) => notificar(tutor, aviso, 'justificacion');
    resultado = await responderPadre(env, colegio, persona, contexto);
  } else {
    resultado = await responderPersonal(env, colegio, persona, contexto);
  }
  if (resultado.pendiente) await guardarPendiente(env, colegio, tel, resultado.pendiente.accion, resultado.pendiente.datos);
  await responder(resultado.texto, { porAtender: resultado.porAtender, motivo: resultado.motivo, documento: resultado.documento });
  if (resultado.enviarCola) await enviarCola(30);
  return salidas;
}

// Mensaje de bienvenida: presenta el agente con el menú del rol de cada persona
export async function bienvenida(env, conexion, persona) {
  const colegio = conexion.colegio;
  const menu = menuDe(persona, colegio);
  return enviar(env, conexion, {
    telefono: persona.telefono, apoderadoId: persona.apoderado?.id, usuarioId: persona.usuario?.id, texto: menu, motivo: 'bienvenida',
    plantilla: colegio.wa_plantilla_bienvenida ? {
      nombre: colegio.wa_plantilla_bienvenida,
      parametros: [persona.nombre, colegio.nombre, NOMBRE_ROL[persona.rol]],
    } : null,
  });
}
