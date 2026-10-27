-- Admisiones, informes generales y demo de 30 días. Solo información pública del colegio y datos voluntarios de familias interesadas.
CREATE TABLE info_colegio (colegio_id INTEGER NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL DEFAULT '', actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (colegio_id, clave));
CREATE TABLE faq (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, palabras TEXT NOT NULL, respuesta TEXT NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_faq_colegio ON faq(colegio_id);
CREATE TABLE leads (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, nombre TEXT NOT NULL, telefono TEXT NOT NULL, grado TEXT, origen TEXT NOT NULL DEFAULT 'whatsapp',
  estado TEXT NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo','contactado','matriculado','descartado')), aviso_en TEXT, creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (colegio_id, telefono));
CREATE TABLE visitas (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, lead_id INTEGER NOT NULL REFERENCES leads(id), horario TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'agendada' CHECK (estado IN ('agendada','realizada','cancelada')), creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_visitas_colegio ON visitas(colegio_id, estado);
ALTER TABLE colegios ADD COLUMN demo_inicio TEXT;
ALTER TABLE colegios ADD COLUMN demo_checklist TEXT;
