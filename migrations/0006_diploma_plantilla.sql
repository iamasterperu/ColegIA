-- Diseño de diploma propio del colegio (PDF sin nombre) y dónde se escribe el nombre de cada alumno.
CREATE TABLE IF NOT EXISTS diploma_plantillas (
  colegio_id INTEGER PRIMARY KEY REFERENCES colegios(id),
  nombre_archivo TEXT NOT NULL,
  pdf_base64 TEXT NOT NULL,
  x_pct REAL NOT NULL DEFAULT 50,
  y_pct REAL NOT NULL DEFAULT 50,
  tam REAL NOT NULL DEFAULT 32,
  color TEXT NOT NULL DEFAULT '#1e3a8a',
  estilo TEXT NOT NULL DEFAULT 'elegante',
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
