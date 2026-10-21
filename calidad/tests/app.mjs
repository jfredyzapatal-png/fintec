/* Monta el DOM real de Fintec.html en jsdom y carga el modulo de dominio
   con estado limpio para cada prueba. */

import { vi } from 'vitest';
import { leerHtml } from './extract-core.mjs';

let n = 0;

export async function cargarApp() {
  const html = leerHtml();
  const head = (html.match(/<head>([\s\S]*?)<\/head>/) || [, ''])[1]
    .replace(/<link[\s\S]*?>/g, '');          // sin tipografias remotas en pruebas
  const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1]
    .replace(/<script>[\s\S]*?<\/script>/g, ''); // el script lo carga el import

  document.documentElement.innerHTML = '<head>' + head + '</head><body>' + body + '</body>';

  /* jsdom no implementa scrollTo y el producto lo llama en cada navegacion */
  window.scrollTo = () => {};

  vi.resetModules();
  const app = await import('../fintec.core.generated.js?n=' + (++n));
  return app;
}

/* Atajo: deja una sesion iniciada con las credenciales dadas. */
export async function conSesion(doc, clave) {
  const app = await cargarApp();
  app.rellenar(doc, clave);
  app.entrar();
  return app;
}

/* Texto del mensaje de error visible en un contenedor .err */
export function errorDe(app, id) {
  const e = app.el(id);
  return e ? e.textContent : '';
}

/* Texto del toast */
export function toast(app) {
  return app.el('toast').textContent;
}

export function pantalla() {
  const s = document.querySelector('.screen.active');
  return s ? s.id : null;
}
