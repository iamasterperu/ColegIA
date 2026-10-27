-- Instantánea del esquema que ya está en producción (D1 "colegia"). No volver a aplicar sobre esa base.
-- Sirve para crear una base nueva: npx wrangler d1 execute colegia --local --file migrations/0000_esquema_base.sql
CREATE TABLE colegios (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, ruc TEXT, direccion TEXT, telefono TEXT,
  email_privacidad TEXT, logo TEXT, color_primario TEXT NOT NULL DEFAULT '#1e3a8a', color_secundario TEXT NOT NULL DEFAULT '#f59e0b',
  anio_escolar INTEGER NOT NULL DEFAULT 2026, info_pago TEXT, es_demo INTEGER NOT NULL DEFAULT 0, registro_banco_datos TEXT,
  wa_modo TEXT NOT NULL DEFAULT 'simulado' CHECK (wa_modo IN ('simulado','cloud')), wa_phone_number_id TEXT, wa_token_cifrado TEXT,
  wa_app_secret_cifrado TEXT, wa_verify_token TEXT, wa_plantilla_recordatorio TEXT, wa_plantilla_aviso TEXT,
  wa_plantilla_idioma TEXT NOT NULL DEFAULT 'es', wa_numeros_prueba TEXT, recordatorio_auto INTEGER NOT NULL DEFAULT 0,
  recordatorio_dias_antes INTEGER NOT NULL DEFAULT 3, creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  portal_padres INTEGER NOT NULL DEFAULT 0, wa_plantilla_bienvenida TEXT, link_pago TEXT, alertas_padres INTEGER NOT NULL DEFAULT 0,
  resumen_diario INTEGER NOT NULL DEFAULT 0);
CREATE TABLE apoderados (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL, dni TEXT, telefono TEXT, email TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE alumnos (
  id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), codigo TEXT NOT NULL, nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL, nombre_busqueda TEXT NOT NULL, dni TEXT, fecha_nacimiento TEXT, nivel TEXT NOT NULL, grado TEXT NOT NULL,
  seccion TEXT NOT NULL DEFAULT 'A', estado TEXT NOT NULL DEFAULT 'matriculado' CHECK (estado IN ('matriculado','retirado','anonimizado')),
  alergias TEXT, condicion_medica TEXT, seguro TEXT, contacto_emergencia TEXT, observaciones TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')), actualizado_en TEXT NOT NULL DEFAULT (datetime('now')), telefono TEXT, direccion TEXT,
  UNIQUE (colegio_id, codigo));
CREATE TABLE alumno_apoderado (alumno_id INTEGER NOT NULL REFERENCES alumnos(id), apoderado_id INTEGER NOT NULL REFERENCES apoderados(id),
  parentesco TEXT, responsable_pago INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (alumno_id, apoderado_id));
CREATE TABLE usuarios (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), nombre TEXT NOT NULL, email TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('direccion','contabilidad','secretaria','profesor','padre')), clave TEXT NOT NULL,
  apoderado_id INTEGER REFERENCES apoderados(id), activo INTEGER NOT NULL DEFAULT 1, ultimo_acceso TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')), telefono TEXT, UNIQUE (colegio_id, email));
CREATE TABLE asistencia (colegio_id INTEGER NOT NULL, alumno_id INTEGER NOT NULL REFERENCES alumnos(id), mes TEXT NOT NULL,
  dias_habiles INTEGER NOT NULL, faltas INTEGER NOT NULL DEFAULT 0, tardanzas INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (alumno_id, mes));
CREATE TABLE auditoria (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, usuario_id INTEGER, usuario_nombre TEXT, rol TEXT,
  accion TEXT NOT NULL, entidad TEXT, entidad_id INTEGER, detalle TEXT, ip TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE consentimientos (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, apoderado_id INTEGER NOT NULL REFERENCES apoderados(id),
  alumno_id INTEGER NOT NULL REFERENCES alumnos(id), finalidad TEXT NOT NULL CHECK (finalidad IN ('whatsapp','salud','imagen','tutor_ia')),
  otorgado INTEGER NOT NULL, version_texto TEXT NOT NULL, medio TEXT NOT NULL CHECK (medio IN ('web','presencial','whatsapp','importacion')),
  registrado_por INTEGER, ip TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE VIEW consentimiento_vigente AS SELECT c.* FROM consentimientos c WHERE c.id = (SELECT MAX(c2.id) FROM consentimientos c2
  WHERE c2.apoderado_id = c.apoderado_id AND c2.alumno_id = c.alumno_id AND c2.finalidad = c.finalidad);
CREATE TABLE documentos (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('examen','sesion','material','texto')), titulo TEXT NOT NULL, grado TEXT, curso TEXT, pedido TEXT,
  contenido TEXT NOT NULL, token TEXT NOT NULL UNIQUE, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE examen_resultados (documento_id INTEGER NOT NULL REFERENCES documentos(id), alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
  falladas TEXT NOT NULL, puntaje REAL, registrado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (documento_id, alumno_id));
CREATE TABLE intentos_login (clave TEXT PRIMARY KEY, fallos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta TEXT);
CREATE TABLE listas_utiles (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), grado TEXT NOT NULL, anio INTEGER NOT NULL,
  titulo TEXT NOT NULL, fuente TEXT NOT NULL DEFAULT 'manual' CHECK (fuente IN ('manual','excel','foto')), publicada INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (colegio_id, grado, anio));
CREATE TABLE utiles_items (id INTEGER PRIMARY KEY, lista_id INTEGER NOT NULL REFERENCES listas_utiles(id) ON DELETE CASCADE, orden INTEGER NOT NULL,
  cantidad TEXT, descripcion TEXT NOT NULL, detalle TEXT);
CREATE TABLE utiles_entregas (alumno_id INTEGER NOT NULL REFERENCES alumnos(id), item_id INTEGER NOT NULL REFERENCES utiles_items(id) ON DELETE CASCADE,
  registrado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (alumno_id, item_id));
CREATE TABLE mensajes (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, telefono TEXT NOT NULL, apoderado_id INTEGER,
  sentido TEXT NOT NULL CHECK (sentido IN ('entrante','saliente')), tipo TEXT NOT NULL CHECK (tipo IN ('texto','audio','plantilla')), texto TEXT,
  transcripcion TEXT, canal TEXT NOT NULL CHECK (canal IN ('simulado','cloud')), motivo TEXT, estado TEXT NOT NULL DEFAULT 'ok', error TEXT,
  wa_message_id TEXT, enviado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), usuario_id INTEGER, entrega TEXT);
CREATE TABLE mensajes_audio (mensaje_id INTEGER PRIMARY KEY REFERENCES mensajes(id), mime TEXT NOT NULL, datos BLOB NOT NULL);
CREATE TABLE notas (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, alumno_id INTEGER NOT NULL REFERENCES alumnos(id), curso TEXT NOT NULL,
  bimestre INTEGER NOT NULL, nota TEXT NOT NULL, UNIQUE (alumno_id, curso, bimestre));
CREATE TABLE pagos (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), alumno_id INTEGER NOT NULL REFERENCES alumnos(id),
  concepto TEXT NOT NULL, periodo TEXT, monto_centimos INTEGER NOT NULL, vencimiento TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','anulado')), pagado_en TEXT, medio TEXT, registrado_por INTEGER,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (alumno_id, concepto));
CREATE TABLE pagos_reportados (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, apoderado_id INTEGER NOT NULL, alumno_id INTEGER, pago_id INTEGER,
  monto_centimos INTEGER, medio TEXT, operacion TEXT, fecha TEXT, estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','rechazado')),
  revisado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE profesor_secciones (usuario_id INTEGER NOT NULL REFERENCES usuarios(id), grado TEXT NOT NULL, seccion TEXT NOT NULL, curso TEXT,
  PRIMARY KEY (usuario_id, grado, seccion));
CREATE TABLE recordatorios (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, pago_id INTEGER NOT NULL REFERENCES pagos(id), apoderado_id INTEGER NOT NULL,
  mensaje_id INTEGER, tipo TEXT NOT NULL CHECK (tipo IN ('previo','vencido')), origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','automatico')),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE sesiones (id TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id), colegio_id INTEGER NOT NULL, expira TEXT NOT NULL, ip TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE solicitudes_arco (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, apoderado_id INTEGER NOT NULL, usuario_id INTEGER,
  tipo TEXT NOT NULL CHECK (tipo IN ('acceso','rectificacion','cancelacion','oposicion')), detalle TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','atendida','rechazada')), respuesta TEXT, atendido_por INTEGER, atendido_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE tutor_temas (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, alumno_id INTEGER NOT NULL REFERENCES alumnos(id), curso TEXT, tema TEXT NOT NULL,
  trabado INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE wa_cola (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, telefono TEXT NOT NULL, apoderado_id INTEGER, nombre TEXT, texto TEXT NOT NULL,
  motivo TEXT NOT NULL, enviado_en TEXT, creado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), mensaje_id INTEGER, lote TEXT);
CREATE TABLE wa_identidad_demo (colegio_id INTEGER NOT NULL, telefono TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('direccion','contabilidad','secretaria','profesor','padre','alumno')), creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (colegio_id, telefono));
CREATE TABLE wa_pendientes (colegio_id INTEGER NOT NULL, telefono TEXT NOT NULL, accion TEXT NOT NULL, datos TEXT NOT NULL, expira TEXT NOT NULL,
  PRIMARY KEY (colegio_id, telefono));
CREATE INDEX idx_aa_apoderado ON alumno_apoderado(apoderado_id);
CREATE INDEX idx_alumnos_busqueda ON alumnos(colegio_id, nombre_busqueda);
CREATE INDEX idx_alumnos_seccion ON alumnos(colegio_id, grado, seccion);
CREATE INDEX idx_alumnos_tel ON alumnos(colegio_id, telefono);
CREATE UNIQUE INDEX idx_apoderados_dni ON apoderados(colegio_id, dni) WHERE dni IS NOT NULL;
CREATE INDEX idx_apoderados_tel ON apoderados(colegio_id, telefono);
CREATE INDEX idx_arco ON solicitudes_arco(colegio_id, estado);
CREATE INDEX idx_auditoria_colegio ON auditoria(colegio_id, id);
CREATE INDEX idx_auditoria_entidad ON auditoria(colegio_id, entidad, entidad_id);
CREATE INDEX idx_cola_lote ON wa_cola(colegio_id, lote);
CREATE INDEX idx_cola_pendiente ON wa_cola(enviado_en, colegio_id, id);
CREATE UNIQUE INDEX idx_colegios_wa ON colegios(wa_phone_number_id) WHERE wa_phone_number_id IS NOT NULL;
CREATE INDEX idx_consent ON consentimientos(apoderado_id, alumno_id, finalidad, id);
CREATE INDEX idx_consent_colegio ON consentimientos(colegio_id, finalidad);
CREATE INDEX idx_documentos ON documentos(colegio_id, usuario_id, id);
CREATE INDEX idx_items_lista ON utiles_items(lista_id, orden);
CREATE INDEX idx_mensajes_estado ON mensajes(colegio_id, estado);
CREATE INDEX idx_mensajes_tel ON mensajes(colegio_id, telefono, id);
CREATE UNIQUE INDEX idx_mensajes_wa ON mensajes(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_pagos_alumno ON pagos(alumno_id);
CREATE INDEX idx_pagos_estado ON pagos(colegio_id, estado, vencimiento);
CREATE INDEX idx_recordatorios_colegio ON recordatorios(colegio_id, creado_en);
CREATE INDEX idx_recordatorios_pago ON recordatorios(pago_id, creado_en);
CREATE INDEX idx_reportados ON pagos_reportados(colegio_id, estado);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_tutor_temas ON tutor_temas(colegio_id, alumno_id, creado_en);
CREATE INDEX idx_usuarios_tel ON usuarios(colegio_id, telefono);
