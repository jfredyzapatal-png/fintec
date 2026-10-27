/* ============================================================
   FINTEC - configuracion del front
   Este archivo se edita a mano para apuntar la aplicacion a una
   API local o a la de produccion. No se compila nada: basta con
   cambiar el valor y recargar la pagina.
   ============================================================ */
window.FINTEC_CONFIG = {
  /* URL base de la API, sin barra final.
     En local el servidor escucha en el puerto 4000 (api/src/config.js).
     En cualquier otro host se usa la API desplegada en Render.
     Si Render asigna otro hostname, cambia solo la cadena de produccion. */
  API_URL: (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : 'https://fintec-api.onrender.com',

  /* Milisegundos antes de abandonar una peticion que no responde.
     OJO: en el plan gratuito de Render el servicio se duerme tras 15 minutos
     sin trafico y tarda cerca de un minuto en despertar, asi que con 10
     segundos la primera peticion fallaria siempre. Si trabajas contra una
     API local puedes bajarlo a 10000 sin problema. */
  TIMEOUT_MS: 75000,

  /* Minutos de inactividad antes del cierre automatico de sesion (RNF-01). */
  INACTIVIDAD_MIN: 10
};
