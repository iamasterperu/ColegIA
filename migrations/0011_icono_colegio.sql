-- Ícono propio de cada colegio para la app instalada, y un nombre corto que se ve debajo del ícono
ALTER TABLE colegios ADD COLUMN nombre_corto TEXT;
ALTER TABLE colegios ADD COLUMN icono TEXT;
