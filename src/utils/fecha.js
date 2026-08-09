// 🆕 Utilidad de fechas — usar SIEMPRE esto en vez de `new Date().toISOString().split('T')[0]`
//
// El bug: toISOString() convierte la fecha a UTC antes de formatearla. En Perú (UTC-5),
// cualquier hora después de las 7:00pm local ya cae "después de medianoche" en UTC, así
// que toISOString() devuelve el día SIGUIENTE. Esto rompía "Ventas de Hoy" en Reportes y
// la fecha por defecto al registrar una compra en Proveedores durante la noche.
//
// Esta función arma la fecha con los métodos LOCALES de JavaScript (getFullYear, getMonth,
// getDate), que sí respetan la zona horaria real de la máquina.
export function obtenerFechaLocalISO(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}