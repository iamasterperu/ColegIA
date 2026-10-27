// ColegIA — Worker principal. Sirve la API (/api/*) y el webhook de WhatsApp (/webhook/*).
// El HTML/CSS/JS de public/ lo sirve Cloudflare directamente sin ejecutar este código.
import { Router, json, ErrorHttp } from './lib/http.js';
import { usuarioDeSesion } from './lib/sesion.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasAlumnos } from './rutas/alumnos.js';
import { rutasPagos, cronRecordatorios, ENVIOS_POR_CORRIDA } from './rutas/pagos.js';
import { rutasUtiles } from './rutas/utiles.js';
import { rutasPanel } from './rutas/panel.js';
import { rutasWhatsapp, rutasWebhook } from './rutas/whatsapp.js';
import { rutasCumplimiento } from './rutas/cumplimiento.js';
import { rutasAdmin } from './rutas/admin.js';
import { rutasImportar } from './rutas/importar.js';
import { limpiar } from './lib/limpieza.js';
import { rutasDocente } from './rutas/docente.js';
import { rutasDocumentosPublicos } from './ia/documentos.js';
import { alertasSemanales, resumenDiario } from './whatsapp/alertas.js';
import { procesarCola } from './whatsapp/comun.js';
import { cargarConexion } from './whatsapp/envio.js';

const router = new Router();
[rutasAuth, rutasAlumnos, rutasPagos, rutasUtiles, rutasPanel, rutasWhatsapp, rutasWebhook,
  rutasCumplimiento, rutasAdmin, rutasImportar, rutasDocente, rutasDocumentosPublicos].forEach((registrar) => registrar(router));

const PUBLICAS = ['/api/login', '/api/logout'];

export default {
  async fetch(request, env, ctxWorker) {
    const url = new URL(request.url);
    const encontrada = router.buscar(request.method, url.pathname);
    if (!encontrada) {
      if (/^\/(api|webhook|d)\//.test(url.pathname)) return json({ error: 'Ruta no encontrada' }, 404);
      return env.ASSETS.fetch(request);
    }
    const esApi = url.pathname.startsWith('/api/');
    // Protección CSRF: las escrituras desde la app llevan esta cabecera, que otro sitio
    // no puede enviar sin permiso CORS (la cookie además es SameSite=Strict).
    if (esApi && request.method !== 'GET' && request.headers.get('x-colegia') !== '1') {
      return json({ error: 'Solicitud no permitida' }, 403);
    }
    const ctx = {
      request, url, params: encontrada.params, usuario: null, colegioId: null,
      waitUntil: (p) => ctxWorker.waitUntil(p),
    };
    try {
      if (esApi && !url.pathname.startsWith('/api/publico/') && !PUBLICAS.includes(url.pathname)) {
        ctx.usuario = await usuarioDeSesion(env, request);
        ctx.colegioId = ctx.usuario?.colegio_id ?? null;
      }
      return await encontrada.manejador(ctx, env);
    } catch (e) {
      if (e instanceof ErrorHttp) return json({ error: e.message }, e.estado);
      console.error(e);
      // Plan gratis de D1: pasado el límite diario de escrituras, todo lo que guarda falla hasta las 00:00 UTC
      if (/exceeded D1's free tier/i.test(String(e?.message))) {
        return json({ error: 'Se alcanzó el límite diario gratuito de la base de datos. Vuelve a funcionar a las 7 p. m. (hora de Lima).' }, 503);
      }
      return json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' }, 500);
    }
  },

  async scheduled(evento, env, ctxWorker) {
    // La limpieza corre una vez al día (primera corrida, 8 a. m. de Lima)
    const primera = new Date(evento.scheduledTime).getUTCHours() === 13;
    // Primero la cola de avisos y comunicados; con lo que sobre, los recordatorios
    const tarea = async () => {
      const dia = new Date(evento.scheduledTime).getUTCDay();
      // Lunes a viernes: resumen del día a dirección (se encola antes para que salga a las 8)
      if (primera && dia >= 1 && dia <= 5) await resumenDiario(env);
      const enviados = await procesarCola(env, ENVIOS_POR_CORRIDA, cargarConexion);
      await cronRecordatorios(env, ENVIOS_POR_CORRIDA - enviados);
      if (primera) await limpiar(env);
      // Lunes 8 a. m.: alerta temprana a cada tutor por WhatsApp
      if (primera && dia === 1) await alertasSemanales(env);
    };
    ctxWorker.waitUntil(tarea());
  },
};
