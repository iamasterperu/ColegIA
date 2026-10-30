-- Automatización: cumpleaños, comunicados por fiestas con aprobación, asistencia diaria, reportes,
-- reinscripción y comprobantes electrónicos. Solo agrega tablas y columnas (no borra nada).
ALTER TABLE apoderados ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE usuarios ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE colegios ADD COLUMN cumple_auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE colegios ADD COLUMN fiestas_auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE colegios ADD COLUMN reporte_auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE colegios ADD COLUMN asistencia_reporte INTEGER NOT NULL DEFAULT 0;
ALTER TABLE colegios ADD COLUMN nbf_ruta TEXT;
ALTER TABLE colegios ADD COLUMN nbf_token_cifrado TEXT;
ALTER TABLE colegios ADD COLUMN nbf_serie_boleta TEXT;
ALTER TABLE colegios ADD COLUMN nbf_serie_factura TEXT;
ALTER TABLE colegios ADD COLUMN nbf_tipo_igv INTEGER NOT NULL DEFAULT 9;
ALTER TABLE documentos ADD COLUMN fuente TEXT;

-- Personal sin acceso a la app (auxiliares, portería, mantenimiento…): solo para saludos y avisos
CREATE TABLE personal (
  id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), nombre TEXT NOT NULL, cargo TEXT,
  telefono TEXT, fecha_nacimiento TEXT, activo INTEGER NOT NULL DEFAULT 1, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_personal_colegio ON personal(colegio_id, activo);

-- Piezas con la plantilla del colegio (tarjetas de cumpleaños, comunicados, constancias, diplomas, reportes)
CREATE TABLE piezas (
  id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('cumple','comunicado','constancia','diploma','reporte')),
  titulo TEXT NOT NULL, contenido TEXT NOT NULL, token TEXT NOT NULL UNIQUE, creado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_piezas_colegio ON piezas(colegio_id, tipo, id);

-- Comunicados automáticos (feriados, Día de la Madre…) que esperan la aprobación de dirección o secretaría
CREATE TABLE borradores (
  id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL REFERENCES colegios(id), clave TEXT NOT NULL, fecha TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT NOT NULL,
  pieza_id INTEGER, estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')), decidido_por INTEGER, decidido_en TEXT,
  destinatarios INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (colegio_id, clave, fecha));

-- Asistencia día por día (la toma de lista del profesor). `asistencia` sigue siendo el resumen mensual.
CREATE TABLE asistencia_diaria (
  colegio_id INTEGER NOT NULL, alumno_id INTEGER NOT NULL REFERENCES alumnos(id), fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('presente','falta','tardanza')), registrado_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (alumno_id, fecha));
CREATE INDEX idx_asis_dia ON asistencia_diaria(colegio_id, fecha);
CREATE TABLE asistencia_listas (
  colegio_id INTEGER NOT NULL, grado TEXT NOT NULL, seccion TEXT NOT NULL, fecha TEXT NOT NULL, usuario_id INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (colegio_id, grado, seccion, fecha));

-- Reportes enviados (evita repetirlos) y reinscripción
CREATE TABLE reportes_enviados (colegio_id INTEGER NOT NULL, clave TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (colegio_id, clave));
CREATE TABLE reinscripciones (
  alumno_id INTEGER NOT NULL REFERENCES alumnos(id), colegio_id INTEGER NOT NULL, anio INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','no_continua')),
  aviso_en TEXT, recordado_en TEXT, recordatorios INTEGER NOT NULL DEFAULT 0, respondido_en TEXT, PRIMARY KEY (alumno_id, anio));
CREATE INDEX idx_reinsc ON reinscripciones(colegio_id, anio, estado);

-- Boletas y facturas electrónicas emitidas con el proveedor del colegio (Nubefact)
CREATE TABLE comprobantes (
  id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, pago_id INTEGER REFERENCES pagos(id), tipo TEXT NOT NULL CHECK (tipo IN ('boleta','factura')),
  serie TEXT, numero INTEGER, cliente_doc_tipo TEXT, cliente_doc TEXT, cliente_nombre TEXT, total_centimos INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido','error')), enlace_pdf TEXT, detalle TEXT, emitido_por INTEGER, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_comprobantes ON comprobantes(colegio_id, id);
