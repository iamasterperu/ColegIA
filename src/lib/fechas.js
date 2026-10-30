// Calendario de fechas del Perú para comunicados automáticos. Los feriados que cambian por decreto
// pueden variar: por eso cada comunicado llega primero a dirección o secretaría para su aprobación.
const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const sumarDias = (fecha, n) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
export function pascua(a) {
  const g = a % 19, c = Math.floor(a / 100), h = (c - Math.floor(c / 4) - Math.floor((8 * c + 13) / 25) + 19 * g + 15) % 30;
  const i = h - Math.floor(h / 28) * (1 - Math.floor(29 / (h + 1)) * Math.floor((21 - g) / 11));
  const j = (a + Math.floor(a / 4) + i + 2 - c + Math.floor(c / 4)) % 7, l = i - j;
  const mes = 3 + Math.floor((l + 40) / 44), dia = l + 28 - 31 * Math.floor(mes / 4);
  return iso(a, mes, dia);
}

// n-ésimo domingo de un mes (mes 1-12)
export function domingoN(a, mes, n) {
  const primero = new Date(Date.UTC(a, mes - 1, 1)).getUTCDay();
  return iso(a, mes, 1 + ((7 - primero) % 7) + 7 * (n - 1));
}

// feriado: hay que avisar que no hay clases · dia: fecha para saludar a la comunidad
export function celebraciones(anio) {
  const p = pascua(anio);
  return [
    { clave: 'anio_nuevo', fecha: iso(anio, 1, 1), nombre: 'Año Nuevo', tipo: 'feriado' },
    { clave: 'dia_nino', fecha: domingoN(anio, 4, 2), nombre: 'Día del Niño Peruano', tipo: 'dia' },
    { clave: 'jueves_santo', fecha: sumarDias(p, -3), nombre: 'Jueves Santo', tipo: 'feriado' },
    { clave: 'viernes_santo', fecha: sumarDias(p, -2), nombre: 'Viernes Santo', tipo: 'feriado' },
    { clave: 'dia_trabajo', fecha: iso(anio, 5, 1), nombre: 'Día del Trabajo', tipo: 'feriado' },
    { clave: 'dia_madre', fecha: domingoN(anio, 5, 2), nombre: 'Día de la Madre', tipo: 'dia' },
    { clave: 'dia_bandera', fecha: iso(anio, 6, 7), nombre: 'Día de la Bandera', tipo: 'dia' },
    { clave: 'dia_padre', fecha: domingoN(anio, 6, 3), nombre: 'Día del Padre', tipo: 'dia' },
    { clave: 'san_pedro', fecha: iso(anio, 6, 29), nombre: 'San Pedro y San Pablo', tipo: 'feriado' },
    { clave: 'dia_maestro', fecha: iso(anio, 7, 6), nombre: 'Día del Maestro', tipo: 'dia' },
    { clave: 'fiestas_patrias', fecha: iso(anio, 7, 28), nombre: 'Fiestas Patrias', tipo: 'feriado' },
    { clave: 'santa_rosa', fecha: iso(anio, 8, 30), nombre: 'Santa Rosa de Lima', tipo: 'feriado' },
    { clave: 'angamos', fecha: iso(anio, 10, 8), nombre: 'Combate de Angamos', tipo: 'feriado' },
    { clave: 'todos_santos', fecha: iso(anio, 11, 1), nombre: 'Día de Todos los Santos', tipo: 'feriado' },
    { clave: 'inmaculada', fecha: iso(anio, 12, 8), nombre: 'Inmaculada Concepción', tipo: 'feriado' },
    { clave: 'navidad', fecha: iso(anio, 12, 25), nombre: 'Navidad', tipo: 'dia' },
  ];
}

// Celebraciones que caen dentro de los próximos `dias` días desde `hoy` (inclusive)
export function proximas(hoy, dias = 3) {
  const a = Number(hoy.slice(0, 4));
  const fin = sumarDias(hoy, dias);
  return [...celebraciones(a), ...celebraciones(a + 1)].filter((c) => c.fecha >= hoy && c.fecha <= fin);
}

export const TEXTO_BASE = {
  feriado: (n, fecha) => `les recordamos que el ${fecha} es feriado por ${n}, por lo que no habrá clases. Retomamos nuestras actividades el siguiente día hábil. ¡Que disfruten en familia!`,
  dia: (n) => `en este ${n}, todo el equipo del colegio les envía un cálido saludo. Gracias por ser parte de nuestra comunidad educativa.`,
};
const ESPECIAL = {
  dia_madre: '¡feliz Día de la Madre! Gracias por su amor, su entrega y su apoyo diario en la formación de nuestros estudiantes. Todo el colegio les envía un abrazo grande.',
  dia_padre: '¡feliz Día del Padre! Gracias por su presencia, su esfuerzo y su ejemplo para nuestros estudiantes. Todo el colegio les envía un saludo muy especial.',
  dia_maestro: '¡feliz Día del Maestro! Gracias a nuestros docentes por su vocación y dedicación para enseñar cada día. Las familias también quieren agradecerles.',
  dia_nino: '¡feliz Día del Niño Peruano! Hoy celebramos a nuestros estudiantes, que son la alegría y el futuro del colegio. Los queremos mucho.',
  navidad: '¡feliz Navidad! Que esta fecha llene sus hogares de paz, unión y esperanza. Gracias por confiar en nosotros este año.',
};
export const textoBase = (c) => (ESPECIAL[c.clave] ? ESPECIAL[c.clave] : TEXTO_BASE[c.tipo](c.nombre, c.fecha.split('-').reverse().join('/')));
