// RUC peruano: 11 dígitos, prefijo 10/15/17/20 y dígito verificador módulo 11.
export function validarRuc(ruc) {
  const r = String(ruc ?? '').trim();
  if (!/^\d{11}$/.test(r)) return 'El RUC debe tener 11 números.';
  if (!['10', '15', '17', '20'].includes(r.slice(0, 2))) return 'El RUC debe empezar con 10, 15, 17 o 20.';
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(r[i]), 0);
  let d = 11 - (suma % 11);
  if (d === 10) d = 0; else if (d === 11) d = 1;
  return d === Number(r[10]) ? '' : 'El dígito final del RUC no coincide. Revísalo.';
}
