# FINTEC — Arquitectura

Visión general de las tres capas, los flujos de datos y las decisiones
técnicas que las sostienen.

---

## 1. Tres capas, un flujo

```
┌─────────────────────────────────────────────┐
│  Navegador                                  │
│  web/index.html + js/api.js + js/app.js     │
│  HTML/CSS/JS plano, sin bundler             │
└───────────────────┬─────────────────────────┘
                    │ HTTPS + JSON
                    │ Authorization: Bearer <jwt>
                    ▼
┌─────────────────────────────────────────────┐
│  Backend                                    │
│  api/src/server.js → app.js                 │
│    ├─ middleware/auth.js   (JWT + relectura)│
│    ├─ middleware/roles.js  (RBAC)           │
│    ├─ routes/*.js          (contrato HTTP)  │
│    ├─ services/*.js        (reglas + SQL)   │
│    └─ lib/reglas.js        (dominio puro)   │
└───────────────────┬─────────────────────────┘
                    │ SQL + FOR UPDATE
                    │ dentro de BEGIN / COMMIT
                    ▼
┌─────────────────────────────────────────────┐
│  PostgreSQL 18 (Render Oregon)              │
│  usuarios · bolsillos · movimientos         │
│  alertas · creditos                         │
└─────────────────────────────────────────────┘
```

### De dónde salen las decisiones

Cada regla de negocio aparece en **al menos dos capas**:

1. **La base** impone invariantes con `CHECK`, FK y `UNIQUE` como última red
   de seguridad. Ningún camino, válido o buggy, puede dejar la base en un
   estado inconsistente.
2. **El servicio** valida antes y realiza la escritura dentro de una
   transacción, con `SELECT ... FOR UPDATE` sobre las filas afectadas para
   serializar operaciones concurrentes.
3. **La ruta** verifica autenticación y permiso del rol antes de llamar al
   servicio.
4. **El front** valida la forma del formulario (campos vacíos, monto > 0) para
   no enviar peticiones inútiles. **No decide reglas de negocio**: muestra el
   mensaje que el servidor devuelva.

---

## 2. Componentes del backend

### 2.1 `src/app.js` — ensamblado de Express
Monta en orden: `helmet`, CORS, JSON body, logger simple, rutas, 404 y
manejador de errores.

```javascript
app.use('/api/auth', rutasAuth);        // público: registro, login
app.use('/api', rutasCuenta);           // usuario: cuenta, movimientos, transferencias, pagos, bolsillos, créditos
app.use('/api/admin', rutasAdmin);      // admin
app.use('/api/contable', rutasContable); // contable (solo lectura)
```

### 2.2 `src/lib/reglas.js` — dominio puro
**Todo lo que decide una regla sin tocar la base.** No importa `pg`, no
importa Express, no importa nada que no sea JavaScript estándar.

Qué contiene:
- `normalizarMonto`, `validarMonto`, `fmt` — manejo de dinero.
- `cupoDiario`, `cupoMensual`, `validarTopes` — RF-04.
- **`evaluarTransferencia`** — la función central: decide si una
  transferencia es válida y qué motivo registrar si no lo es.
- `PERMISOS` + `puede` — matriz de autorización RBAC.
- `validarRegistro`, `validarCambioClave` — RF-01, RF-06.
- `siguienteIntento`, `estaBloqueadoPorIntentos` — RNF-02.

Esto es lo que se prueba con `node:test` sin PostgreSQL: 51 pruebas, 51 en
verde. Si rompes una regla aquí, falla una prueba antes de llegar a la base.

### 2.3 `src/services/*.js` — orquestación
Un archivo por recurso:

| Archivo | Qué resuelve |
|---|---|
| `auth.js` | Registro, login (bcrypt + intentos + bloqueo), cambio de contraseña |
| `cuenta.js` | Resumen de cuenta, titular de una cuenta, cambio de topes |
| `transferencias.js` | Transferencia entre cuentas con doble `FOR UPDATE` |
| `pagos.js` | Pago a convenio |
| `bolsillos.js` | Crear, aportar, retirar |
| `creditos.js` | Solicitar, listar, pagar cuota, pagar total |
| `admin.js` | Búsqueda, bloqueo, devolución, cancelación |
| `contable.js` | Resumen financiero, historial global |
| `comun.js` | `insertarMovimiento`, `insertarAlerta`, `movimientoPublico` |

Patrón común a los que mueven dinero:

```javascript
return enTransaccion(async (cliente) => {
  // 1) Lock pesimista en orden estable (evita deadlock)
  const [a, b] = await cliente.query(
    `SELECT ... FROM usuarios WHERE doc = ANY($1) ORDER BY doc FOR UPDATE`,
    [[docOrigen, docDestino]]
  );

  // 2) Validaciones con los saldos ya bloqueados
  if (/* saldo insuficiente */) throw malaPeticion(...);

  // 3) UPDATE condicional como red final
  const { rowCount } = await cliente.query(
    `UPDATE usuarios SET disponible = disponible - $2
     WHERE doc = $1 AND disponible >= $2`,
    [docOrigen, monto]
  );
  if (rowCount !== 1) throw malaPeticion('Saldo insuficiente.');

  // 4) Registrar movimiento + alertas
  const mov = await insertarMovimiento(cliente, {...});
  await insertarAlerta(cliente, docOrigen, '...');
  await insertarAlerta(cliente, docDestino, '...');

  return { movimiento: movimientoPublico(mov), ... };
});
```

### 2.4 `src/middleware/`

| Archivo | Función |
|---|---|
| `auth.js` | Verifica el JWT, **relee el usuario de la base en cada petición** (así un bloqueo administrativo corta la sesión al instante, sin esperar a que el token expire) |
| `roles.js` | `requiereRol('admin')`, `requierePermiso('credito:solicitar')`, `soloLecturaContable` |
| `errores.js` | Manejador central: traduce `ErrorApp` a `{ error: mensaje }` con el HTTP correcto |

### 2.5 `src/db.js` — pool y transacciones
Pool de `pg` con `max: 5` (el plan gratuito de Postgres de Render tiene pocas
conexiones). TLS obligatorio en producción con `rejectUnauthorized: false`
(Render usa certificado autofirmado interno).

`enTransaccion(fn)` abre un cliente del pool, `BEGIN`, llama `fn(cliente)`,
`COMMIT` si todo va bien, `ROLLBACK` si lanza, libera el cliente en `finally`.

---

## 3. Autenticación

```
POST /api/auth/login { documento, clave }
   │
   ▼
bcryptjs.compare(clave, usuario.clave_hash)
   │
   ├─ falla → intentos_fallidos++; si >= 5 → bloqueado_hasta = now()+15min
   │
   └─ éxito → intentos_fallidos = 0
                      │
                      ▼
                jwt.sign(
                  { doc, rol, cuenta },
                  JWT_SECRET,
                  { expiresIn: '10m' }   // RNF-01
                )
                      │
                      ▼
                { token, usuario: { doc, nombre, rol, cuenta } }
```

En cada petición autenticada:

```
Request Authorization: Bearer <jwt>
   │
   ▼
jwt.verify(token, JWT_SECRET)
   │
   ▼
SELECT * FROM usuarios WHERE doc = $1
   │
   ├─ no existe → 401
   ├─ bloqueada → 403
   └─ activa → req.usuario = usuario; next()
```

**Nota**: el token lleva solo `doc`, `rol` y `cuenta`. Un JWT va firmado pero
no cifrado: nunca poner nada sensible en el payload.

---

## 4. Autorización por rol (RBAC)

El rol de un usuario (`usuario`, `admin`, `contable`) determina qué
**permisos** tiene, no qué **rutas** puede llamar. La matriz de permisos:

```javascript
PERMISOS = {
  usuario: [
    'cuenta:leer', 'cuenta:topes', 'movimientos:propios',
    'transferencia:crear', 'pago:crear',
    'bolsillo:crear', 'bolsillo:mover',
    'alertas:propias', 'password:cambiar',
    'credito:leer', 'credito:solicitar', 'credito:pagar',
  ],
  admin: [
    'admin:usuarios', 'admin:estado', 'admin:movimientos',
    'admin:devolucion', 'admin:cancelacion',
    'contable:movimientos',  // ve también el historial contable
    'password:cambiar',
  ],
  contable: [
    'contable:resumen', 'contable:movimientos', 'password:cambiar',
    // ningún permiso de escritura (RN-06)
  ],
};
```

Cada ruta se decora con `requierePermiso('alguno')`. Si el rol no tiene ese
permiso → 403.

Como **red de seguridad adicional** (RN-06), el middleware
`soloLecturaContable` bloquea cualquier POST/PUT/PATCH/DELETE que haga un
usuario de rol `contable`, independientemente del permiso individual.

---

## 5. Transacciones y concurrencia

### El problema que resuelven
En memoria del navegador, dos "transferencias" simultáneas se ejecutaban en
secuencia porque JavaScript es single-threaded. En un servidor con varios
clientes concurrentes, sin ninguna coordinación, dos peticiones podrían leer
el saldo (digamos $100), decidir que ambas pueden descontarlo, y acabar
descontando $200 de un disponible de $100.

### Cómo lo evita FINTEC

**Lock pesimista** con `SELECT ... FOR UPDATE`:

```sql
SELECT * FROM usuarios WHERE doc = ANY($1) ORDER BY doc FOR UPDATE
```

Las filas quedan bloqueadas hasta el fin de la transacción. Una segunda
transacción que quiera las mismas filas se queda **esperando** (no leyendo
valores obsoletos).

**Ordenar siempre por `doc`** evita deadlock cuando A→B y B→A ocurren a la
vez (ambas transacciones toman los locks en el mismo orden).

**`UPDATE ... WHERE ... AND disponible >= $monto`** y comprobar `rowCount`:
si entre la validación y el update algo cambió (no debería, con el lock),
`rowCount = 0` y hay `ROLLBACK`.

**`CHECK (disponible >= 0)` en la tabla**: si todo lo anterior falla por un
bug, la base rechaza el `UPDATE` con un error. El disponible **no puede**
quedar negativo.

### Dónde se aplica

| Servicio | Filas que bloquea |
|---|---|
| `transferencias.js` | Las dos cuentas en un solo `SELECT ... FOR UPDATE` ordenado |
| `bolsillos.js` | El usuario + el bolsillo |
| `admin.js` (devolución/cancelación) | El movimiento original + las dos cuentas involucradas |
| `creditos.js` (solicitud) | Solo el usuario |
| `creditos.js` (pagos) | El crédito + el usuario |

---

## 6. Front-end

**No tiene bundler ni dependencias de node_modules.** Es HTML + CSS + JS
plano servido como static site. Beneficios para el entregable académico:

- No hay `node_modules/` que explicar.
- No hay build que fallar en Render.
- El profesor puede abrir cada archivo con un editor de texto.

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `web/index.html` | Marcado de todas las pantallas (landing, login, registro, 8 pantallas usuario, 2 admin, 2 contable) |
| `web/css/estilos.css` | CSS extraído del prototipo, sin cambios de estilo |
| `web/config.js` | URL del API y tiempos (se edita para apuntar a otro entorno) |
| `web/js/api.js` | Cliente HTTP: token JWT en `sessionStorage`, `Authorization: Bearer`, manejo de 401/403 y errores de red |
| `web/js/app.js` | Enrutador por pantalla + funciones `pintarX()` que llaman a `API.y()` y renderizan HTML |

### Patrón de pantalla

```javascript
function pintarCreditos() {
  const b = document.getElementById('b-creditos');
  b.innerHTML = cargando();
  Promise.all([API.cuentaMe(), API.listarCreditos()])
    .then(([cuenta, creditos]) => {
      b.innerHTML = /* HTML con los datos */;
    })
    .catch(e => {
      if (e.code === 'sesionVencida') return;
      b.innerHTML = fallo('No pudimos cargar tus créditos', () => pintarCreditos());
    });
}
```

Cada `pintarX()` sigue el mismo patrón: *cargando* → `fetch` → render o
*fallo con reintento*. Nunca hay pantallas en blanco.

### Guardia de rol en el cliente (comodidad, no seguridad)

```javascript
const ROL_PANTALLA = {
  'u-inicio': 'usuario', 'u-creditos': 'usuario', ...
  'a-panel': 'admin', ...
  'c-panel': 'contable', ...
};

function go(screen) {
  if (ROL_PANTALLA[screen] && SESION.rol !== ROL_PANTALLA[screen]) return;
  // ...
}
```

**No es una medida de seguridad**: cualquiera puede llamar `go('a-panel')`
desde la consola. La seguridad real la impone el middleware del servidor en
cada petición HTTP.

---

## 7. Despliegue (Render)

Tres servicios, todos en el plan Free, todos en Oregon:

```
┌───────────────────────────────────┐
│  Static Site: fintec-web          │
│  → sirve web/* desde el repo      │
│  → https://fintec-web.onrender.com│
└──────────────┬────────────────────┘
               │ fetch https://fintec-api.onrender.com
               │ (CORS respondido por la API)
               ▼
┌───────────────────────────────────┐
│  Web Service: fintec-api          │
│  → node src/server.js             │
│  → https://fintec-api.onrender.com│
│  → se suspende tras 15 min sin uso│
└──────────────┬────────────────────┘
               │ pg con DATABASE_URL interna + TLS
               ▼
┌───────────────────────────────────┐
│  PostgreSQL: fintec-db            │
│  → 1 GB · caduca a los 30 días    │
│  → sin backups automáticos        │
└───────────────────────────────────┘
```

### Comportamientos específicos del plan Free que vale la pena saber

- **Primer request del día tarda ~1 minuto**: el web service dormía. No es un
  error, es cold start.
- **La base caduca a los 30 días** desde su creación. Rehacerla implica
  `npm run migrate` + `npm run seed` (son 2 comandos; dura minutos).
- **No hay shell en el plan Free**: las migraciones se corren desde la
  máquina local contra la URL externa (`External Database URL`).
- **No hay backups automáticos**: periódicamente `pg_dump` manual.

Guía paso a paso: [`deploy/GUIA_DESPLIEGUE.md`](../deploy/GUIA_DESPLIEGUE.md).

---

## 8. Decisiones defendibles en la sustentación

1. **Separación `lib/reglas.js` vs `services/*.js`**: la lógica probable sin
   base de datos vs la lógica que necesita SQL. 51 pruebas rápidas garantizan
   que las decisiones de dominio están bien antes de pensar en la base.

2. **PostgreSQL con `pg` directo, sin ORM**: 5 tablas simples, consultas
   directas de 2-10 líneas, control exacto de las transacciones. Un ORM
   añadiría un DSL propio que oculta justo lo que hay que mostrar al jurado.

3. **JWT con `exp 10m` + relectura del usuario**: cumple RNF-01 (cierre a
   los 10 min) y permite revocación efectiva por bloqueo administrativo
   (RN-07) sin lista de revocación en memoria.

4. **`bcryptjs` en vez de `bcrypt`**: la versión nativa `bcrypt` requiere
   compilar con `node-gyp` en el build de Render. `bcryptjs` es JS puro, no
   compila, usa el mismo formato de hash, solo es ~2× más lento (irrelevante
   a nuestra escala).

5. **El front no tiene bundler**: menos piezas móviles, menos cosas que puedan
   fallar en la demo. El CSS del prototipo se mueve a un archivo externo sin
   modificar una regla.

6. **El prototipo `producto/Fintec.html` no se modifica**: las 51 pruebas
   Vitest siguen corriendo contra él como regresión visual y de reglas.

7. **Migraciones aditivas separadas** (`schema_creditos.sql`): la migración
   original es destructiva (`DROP TABLE`). Para añadir un módulo a una base
   en producción se crea una migración aditiva, idempotente, que puede correr
   varias veces sin romper nada.

8. **El token vive en `sessionStorage`** (no `localStorage`): se pierde al
   cerrar la pestaña y no es visible a otras pestañas. Es un compromiso: una
   cookie `httpOnly` sería más resistente a XSS pero exige protección CSRF.
