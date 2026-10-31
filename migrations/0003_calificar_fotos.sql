-- Calificación de exámenes por foto: porcentaje, nivel y si la nota vino sin detalle de preguntas
ALTER TABLE examen_resultados ADD COLUMN porcentaje REAL;
ALTER TABLE examen_resultados ADD COLUMN nivel TEXT;
ALTER TABLE examen_resultados ADD COLUMN sin_detalle INTEGER NOT NULL DEFAULT 0;
ALTER TABLE examen_resultados ADD COLUMN origen TEXT;
