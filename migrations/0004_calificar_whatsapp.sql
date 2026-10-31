-- Hojas de exámenes calificados que el profesor manda por WhatsApp (una fila por foto, se leen al llegar)
CREATE TABLE calif_fotos (id INTEGER PRIMARY KEY, colegio_id INTEGER NOT NULL, telefono TEXT NOT NULL, documento_id INTEGER NOT NULL,
  orden INTEGER NOT NULL, lectura TEXT, nombre_manual TEXT, descartada INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_calif_fotos ON calif_fotos(colegio_id, telefono, documento_id, orden, id);
