# FINTEC — front-end contra la API

Misma aplicación de banca digital del prototipo
`producto/Fintec.html`, pero los datos salen de la API por HTTP en lugar del
objeto `BANCO` en memoria.

El archivo original **no se tocó** y sigue funcionando solo, sin servidor. Esta
carpeta es independiente.

**Versión actual:** v1.1.0 — añade el **simulador público con 3 tipos** y la
pantalla **Crédito** para el usuario autenticado. Ver
[`../docs/MODULO_CREDITO.md`](../docs/MODULO_CREDITO.md) y
[`../docs/MANUAL_USUARIO.md`](../docs/MANUAL_USUARIO.md).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Marcado de todas las pantallas (landing, login, registro, usuario, admin, contable). |
| `css/estilos.css` | CSS extraído tal cual del original, sin un solo cambio. |
| `config.js` | URL base de la API y un par de ajustes. Es lo único que se edita para cambiar de entorno. |
| `js/api.js` | Cliente HTTP: token JWT, cabecera `Authorization`, errores HTTP y de red. |
| `js/app.js` | Navegación y pintado de cada pantalla. |

## Apuntar a una API

Edita `config.js` y cambia `API_URL`:

```js
window.FINTEC_CONFIG = {
  API_URL: 'http://localhost:3000',   // local
  // API_URL: 'https://api.fintec.example.com',  // producción
  // API_URL: '',                      // la API se sirve en el mismo origen
  TIMEOUT_MS: 10000,
  INACTIVIDAD_MIN: 10
};
```

No hay compilación ni dependencias: se guarda el archivo y se recarga la página.

Sirve la carpeta por HTTP (no la abras con `file://`, el navegador bloquea las
peticiones por CORS). Con Node:

```
npx serve web
```

Si la API vive en otro origen, debe responder CORS con `Access-Control-Allow-Origin`
y permitir la cabecera `Authorization` y los métodos `GET, POST, PUT, PATCH`.

## Decisiones

- **El servidor es la autoridad.** Las reglas de negocio (saldo insuficiente,
  topes, cuenta bloqueada, intentos fallidos de login, unicidad del documento)
  las decide la API; el front muestra el mensaje que ella devuelva. Aquí solo
  quedan validaciones de formulario (campos vacíos, monto mayor que cero,
  contraseñas que coinciden) para no mandar peticiones inútiles.
- **Token JWT** en memoria, respaldado en `sessionStorage`, para que recargar la
  pestaña no cierre la sesión. Al cerrar la pestaña se pierde. Si una petición
  responde 401, la sesión local se cierra sola.
- **Transferencia en dos pasos**, igual que el original: al pulsar *Transferir*
  se llama `GET /api/cuenta/:cuenta/titular` y se muestra el nombre del titular;
  `POST /api/transferencias` solo se envía al pulsar *Sí, enviar*.
- **Guardia de rol por pantalla** (un usuario no abre el panel de admin ni el de
  contable). Es comodidad de navegación: la autorización real la impone la API.
- **Cierre de sesión a los 10 minutos** de inactividad, configurable.
- **Cuando la API no responde** cada pantalla muestra el motivo, la URL
  configurada y un botón *Reintentar*, en vez de quedarse en blanco.
- **Nombres de campo tolerantes:** se acepta `ts` o `fecha`, `valor` o `monto`,
  un array plano o `{datos:[...]}`. Si la API usa otros nombres, se ajusta en los
  helpers `primero` / `comoLista` de `js/app.js`.

### Único cambio de texto respecto al original

En la barra superior, `maqueta de una sola página` pasó a
`versión conectada a la API`, porque la frase original ya no describe esta
versión. Todo lo demás (colores, tipografías, clases, estructura y textos) es
idéntico.

## Qué se verificó y qué no

Se verificó, con una **API falsa** escrita para la prueba (no incluida aquí) que
responde el contrato acordado:

- `node --check` pasa en `config.js`, `js/api.js` y `js/app.js`.
- La landing carga sin errores de JavaScript.
- Con la API apagada, el login muestra *"No pudimos conectar con el servidor de
  FINTEC…"* en el `.err`, y las pantallas privadas muestran la tarjeta de error
  con *Reintentar*. No hay pantallas en blanco ni excepciones de JS.
- Login de los tres roles y redirección a la pantalla que les toca.
- Pantallas de usuario (inicio, enviar, bolsillos, pagar, movimientos, alertas,
  exportar), panel de admin con sus métricas, historial global y panel contable.
- La transferencia en dos pasos: se comprobó en el registro de red que
  `GET /titular` ocurre primero y que `POST /api/transferencias` **solo** se
  envía al confirmar.
- La guardia de rol: con sesión de usuario, `go('a-panel')` y `go('c-panel')`
  devuelven a `u-inicio`.
- Comparación visual de la landing contra el original a 1024x768: idénticas.

**No se verificó** (no había API real; el mock responde el contrato, no la
lógica de negocio):

- Los nombres y tipos exactos de los campos que devuelve la API real. Si difieren
  del contrato, hay que ajustar los helpers tolerantes mencionados arriba.
- Registro, cambio de contraseña, guardar topes, pagos, crear/aportar/retirar de
  bolsillos, bloquear/desbloquear cuentas y devolución/cancelación: el front los
  llama correctamente, pero no se vio la respuesta de un servidor real.
- Los mensajes de error de negocio ("Saldo insuficiente", "Supera tu tope
  diario"): se muestra lo que mande la API, pero no se comprobó contra sus
  textos reales.
- El cierre por inactividad a los 10 minutos (no se esperaron 10 minutos).
- La expiración real de un JWT y el 401 consiguiente.
- CORS contra la API real.
- **El CSV global del panel contable** usa `GET /api/admin/movimientos`, que en el
  contrato es un endpoint de administrador. Si la API se lo niega al rol
  contable, ese botón mostrará el error de permiso; haría falta un endpoint de
  movimientos para contable o permitirle ese. El CSV del usuario usa
  `GET /api/movimientos?desde&hasta` y no tiene ese problema.
