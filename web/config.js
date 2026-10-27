/* ============================================================
   FINTEC - configuracion del front
   Este archivo se edita a mano para apuntar la aplicacion a una
   API local o a la de produccion. No se compila nada: basta con
   cambiar el valor y recargar la pagina.
   ============================================================ */
window.FINTEC_CONFIG = {
  /* URL base de la API, sin barra final.
     Local:      'http://localhost:3000'
     Produccion: 'https://api.fintec.example.com'
     Si la API se sirve en el mismo origen que este front, deja ''. */
  API_URL: 'http://localhost:3000',

  /* Milisegundos antes de abandonar una peticion que no responde.
     OJO: en el plan gratuito de Render el servicio se duerme tras 15 minutos
     sin trafico y tarda cerca de un minuto en despertar, asi que con 10
     segundos la primera peticion fallaria siempre. Si trabajas contra una
     API local puedes bajarlo a 10000 sin problema. */
  TIMEOUT_MS: 75000,

  /* Minutos de inactividad antes del cierre automatico de sesion (RNF-01). */
  INACTIVIDAD_MIN: 10
};
