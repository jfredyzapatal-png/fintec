/* Extrae la logica de dominio del producto (Fintec.html) a un modulo ES
   importable por Vitest.

   Se genera en cada ejecucion a partir del HTML real, de modo que las pruebas
   unitarias corren contra el mismo codigo que se entrega, sin una copia
   paralela que pueda divergir. El archivo generado NO se edita a mano. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RUTA_HTML = path.resolve(aqui, '..', '..', 'producto', 'Fintec.html');
export const RUTA_CORE = path.resolve(aqui, '..', 'fintec.core.generated.js');

/* Nombres del producto que las pruebas necesitan alcanzar. */
const EXPORTADOS = [
  'BANCO', 'CONVENIOS', 'MAX_INTENTOS', 'BLOQUEO_MIN', 'INACTIVIDAD_MS', 'ROL_PANTALLA',
  'fmt', 'el', 'val', 'iso', 'porCuenta', 'clientes', 'totalBolsillos', 'mios',
  'entrar', 'salir', 'rellenar', 'registrar', 'cambiarPassword',
  'transferir', 'confirmarTransferencia', 'cancelarTransferencia', 'pagar',
  'aportar', 'retirar', 'crearBolsillo',
  'guardarTopes', 'enviadoEn', 'cupoDiario', 'cupoMensual',
  'TOPE_DIARIO_DEF', 'TOPE_MENSUAL_DEF',
  'devolver', 'cancelar', 'buscar', 'alternarBloqueo',
  'verUsuario', 'cerrarDetalle', 'pintarAdminMovimientos',
  'filtrarMovimientos', 'limpiarFiltroMovimientos',
  'exportarCSV', 'aplicarRangoContable', 'resetRangoContable',
  'go', 'ping', 'simular'
];

export function leerHtml() {
  return fs.readFileSync(RUTA_HTML, 'utf8');
}

export function generarCore() {
  const html = leerHtml();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('No se encontro el bloque <script> en Fintec.html');

  const cuerpo = m[1];
  /* Acepta tanto "function f(" / "const X =" como declaraciones encadenadas
     del tipo "const A = 1, B = 2;" */
  const faltantes = EXPORTADOS.filter(n =>
    !new RegExp('(function|const|let)\\s+' + n + '\\b').test(cuerpo) &&
    !new RegExp(',\\s*' + n + '\\s*=').test(cuerpo));
  if (faltantes.length) {
    throw new Error('El producto ya no declara: ' + faltantes.join(', '));
  }

  const salida = [
    '/* ARCHIVO GENERADO por tests/extract-core.mjs a partir de Fintec.html.',
    '   No editar: se sobrescribe en cada ejecucion de las pruebas. */',
    cuerpo,
    '',
    'export { ' + EXPORTADOS.join(', ') + ' };',
    '/* Accesores para que las pruebas puedan leer y fijar el estado de sesion,',
    '   que en el producto es una variable de modulo. */',
    'export function __setSesion(u){ sesion = u; }',
    'export function __getSesion(){ return sesion; }',
    'export function __sembrarUsuario(){ return usuario.apply(null, arguments); }'
  ].join('\n');

  fs.writeFileSync(RUTA_CORE, salida, 'utf8');
  return RUTA_CORE;
}

if (process.argv[1] && process.argv[1].endsWith('extract-core.mjs')) {
  const r = generarCore();
  console.log('core generado desde el producto ->', path.basename(r));
}
