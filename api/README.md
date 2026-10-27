# FINTEC — API (backend)

Backend de la billetera digital FINTEC. Lleva a un servidor real la
lógica que el prototipo `producto/Fintec.html` tenía en memoria
(objeto `BANCO`), para que las reglas de negocio las valide el
servidor y no el navegador.

**Pila:** Node 24 · Express 5 · PostgreSQL (`pg`, SQL directo sin ORM) ·
bcrypt · jsonwebtoken. Módulos ESM.

---

## 1. Estructura

```
api/
├── db/
│   ├── schema.sql      DDL: usuarios, bolsillos, movimientos, alertas
│   ├── migrate.js       npm run migrate  -> aplica schema.sql
│   └── seed.js          npm run seed     -> 6 clientes + admin + contable
├── src/
│   ├── config.js        variables de entorno
│   ├── db.js            pool de conexión y helper enTransaccion()
│   ├── app.js           ensamblado de Express
│   ├── server.js        arranque
│   ├── lib/
│   │   ├── reglas.js    LÓGICA DE NEGOCIO PURA (lo que se prueba sin BD)
│   │   └── errores.js   ErrorApp con código HTTP
│   ├── middleware/
│   │   ├── auth.js      verificación del JWT + relectura del usuario
│   │   ├── roles.js     autorización por rol y permiso
│   │   └── errores.js   manejador central de errores y 404
│   ├── services/        reglas + SQL, todo dentro de transacciones
│   └── routes/          auth, cuenta, admin, contable
└── test/                pruebas con node:test (sin base de datos)
```

La separación clave es **`src/lib/reglas.js`**: ahí vive toda la
decisión de negocio que no necesita base de datos (montos, cupos,
topes, validaciones de registro, matriz de permisos). Los servicios
solo añaden el SQL y la transacción. Eso permite probar las reglas sin
PostgreSQL y es lo que hace la suite de `test/`.

---

## 2. Puesta en marcha local

```bash
cd api
npm install

# 1) configurar el entorno
cp .env.example .env
#    edita .env: DATABASE_URL, JWT_SECRET, PORT
#    para generar el secreto:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2) crear la base en PostgreSQL (una sola vez)
createdb fintec
#    o:  psql -U postgres -c "CREATE DATABASE fintec;"

# 3) crear las tablas y cargar los datos de demostración
npm run migrate
npm run seed

# 4) levantar el API
npm run dev        # con recarga automática (node --watch)
npm start          # sin recarga
```

Queda escuchando en `http://localhost:4000`. Prueba rápida:

```bash
curl http://localhost:4000/api/health
# {"ok":true,"servicio":"fintec-api","bd":"conectada"}
```

`GET /api/health` es el endpoint de health check del despliegue
(el blueprint declara `healthCheckPath: /api/health`). No pide
autenticación y **siempre responde 200**, incluso si PostgreSQL no
contesta: el estado de la base va en el campo `bd`
(`"conectada"` o `"sin conexión"`), no en el código HTTP, para que una
caída momentánea de la base no marque el despliegue como fallido.

> `npm run migrate` ejecuta `DROP TABLE` antes de crear: **recrea la base
> desde cero**. `npm run seed` hace `TRUNCATE`. Son scripts de
> demostración académica, no migraciones incrementales de producción.

### Scripts

| script | qué hace |
|---|---|
| `npm start` | arranca el servidor |
| `npm run dev` | arranca con `node --watch` |
| `npm run migrate` | aplica `db/schema.sql` |
| `npm run seed` | carga los 6 clientes, admin y contable |
| `npm test` | pruebas de lógica pura (no necesita PostgreSQL) |

---

## 3. Base de datos

Cuatro tablas. El esquema completo está en `db/schema.sql`.

| tabla | para qué | restricciones destacadas |
|---|---|---|
| `usuarios` | clientes, admin y contable | `CHECK (disponible >= 0)` (RN-01), `rol IN (usuario, admin, contable)`, `estado IN (activa, bloqueada)`, `tope_diario <= tope_mensual`, `cuenta` UNIQUE, correo único |
| `bolsillos` | metas de ahorro de **una** cuenta | FK a `usuarios` (RN-02), `CHECK (saldo >= 0)`, nombre único por usuario |
| `movimientos` | libro de operaciones | `codigo` legible `TX-####` UNIQUE, `CHECK (valor > 0)`, motivo obligatorio si no está Completada (RN-03), `original_id` FK a sí misma para reversiones (RN-05), una sola reversión por original |
| `alertas` | notificaciones al usuario (RF-06) | FK a `usuarios`, índice por usuario y fecha |

Puntos del modelo que conviene saber al defenderlo:

- **`movimientos.codigo`** es el id legible que ve el usuario (`TX-8841`),
  generado por la secuencia `movimientos_codigo_seq` (arranca en 8841,
  igual que el prototipo). El `id` numérico es interno; los endpoints
  aceptan cualquiera de los dos.
- **`origen` y `destino` son TEXT, no FK.** Un extremo puede no ser una
  cuenta FINTEC: un convenio (`'EPM'`), el nombre de un bolsillo, o una
  cuenta externa que no existe (el movimiento rechazado del seed va a
  `009-112-000`). Forzar una FK impediría registrar justamente los
  rechazos que exige RN-03.
- **`original_id`** enlaza la reversión/cancelación con el movimiento
  original (RN-05). El `CHECK` obliga a que solo los tipos `Reversión`
  y `Cancelación` lo tengan, y solo ellos.
- `admin` y `contable` llevan un número de cuenta propio
  (`ADM-000-001`, `CTB-000-002`) porque la columna es UNIQUE; no son
  cuentas transaccionales.

### Datos del seed

Los mismos 6 clientes del prototipo. **Total del sistema: $18.000.000**
(disponible + bolsillos); el seed falla si no cuadra.

| cliente | documento | clave | cuenta | disponible | bolsillos |
|---|---|---|---|---|---|
| María Gómez | 1023456789 | maria123 | 001-234-567 | 2.450.000 | Vacaciones 800.000 · Emergencias 350.000 |
| Carlos Ruiz | 1098765432 | carlos123 | 001-880-112 | 1.200.000 | Estudio 400.000 |
| Laura Díaz | 1076543210 | laura123 | 009-441-220 | 3.800.000 | Viaje 1.000.000 |
| Andrés Pérez | 1045678901 | andres123 | 008-990-455 | 640.000 | — |
| Valentina Soto | 1012334455 | valentina123 | 001-556-330 | 3.200.000 | Moto 700.000 |
| Julián Mesa | 1067889900 | julian123 | 007-221-884 | 2.960.000 | Estudio 500.000 |
| Administrador | admin | admin123 | — | 0 | rol `admin` |
| Contable | contable | conta123 | — | 0 | rol `contable` |

Las claves se insertan **hasheadas con bcrypt** (RNF-02); la columna se
llama `clave_hash` y no existe ninguna columna de contraseña en claro.
Estas claves son públicas porque el propio prototipo las muestra en
botones de la pantalla de login.

---

## 4. Reglas de negocio en el servidor

| regla | dónde se implementa |
|---|---|
| RN-01 el disponible nunca queda negativo | `CHECK (disponible >= 0)` + `UPDATE ... WHERE disponible >= $monto` + validación previa en `reglas.evaluarTransferencia` |
| RN-02 el dinero solo se mueve entre el disponible y los bolsillos de la misma cuenta | toda consulta de bolsillo filtra por `usuario_doc`; un id ajeno da 404 y nunca mueve dinero (`services/bolsillos.js`) |
| RN-03 toda operación rechazada o cancelada registra su motivo | se inserta un movimiento `Rechazada` con la nota del motivo; el `CHECK movimientos_motivo_obligatorio` lo exige a nivel de tabla |
| RN-04 el administrador no edita saldos a mano | no existe ninguna ruta ni función que escriba un saldo; solo `devolucion` y `cancelacion` sobre movimientos existentes |
| RN-05 la devolución crea un movimiento nuevo enlazado y no edita el original; la cancelación sí marca el original como Cancelada | `services/admin.js`, función `revertir` |
| RN-06 el contable es solo lectura | matriz `PERMISOS` (no tiene ningún permiso de escritura) + middleware `soloLecturaContable` que bloquea POST/PUT/PATCH/DELETE |
| RN-07 una cuenta bloqueada no inicia sesión, no transacciona y no recibe dinero | `services/auth.login`, `middleware/auth` (relee el usuario en cada petición) y `evaluarTransferencia` (destino bloqueado) |
| RF-04 topes diario y mensual; el exceso se rechaza y queda registrado | `reglas.cupoDiario/cupoMensual` + `comun.enviadoDiaYMes` (suma de transferencias completadas salientes del día y del mes) |
| transferencia sobre el disponible → `Rechazada` motivo "Saldo insuficiente", sin mover saldos | `evaluarTransferencia` devuelve `registrar: true`; el servicio inserta el movimiento y no toca ningún saldo |
| no se puede transferir a la propia cuenta | `evaluarTransferencia` (no genera movimiento) |
| RNF-01 cierre de sesión por inactividad | el JWT expira a los 10 minutos (`JWT_EXPIRES_IN`) |
| RNF-02 claves hasheadas y bloqueo tras 5 intentos | bcrypt; `intentos_fallidos` y `bloqueado_hasta` en `usuarios`, 15 minutos de bloqueo |

### Concurrencia (lo importante de mover esto a un servidor)

Toda operación que mueve dinero corre dentro de `enTransaccion()`
(`BEGIN` / `COMMIT` / `ROLLBACK` en `src/db.js`) y **bloquea las filas
implicadas con `SELECT ... FOR UPDATE` antes de leer saldos**:

- `services/transferencias.js` bloquea las dos cuentas en una sola
  consulta `ORDER BY doc FOR UPDATE`. El orden estable evita el deadlock
  cuando A→B y B→A ocurren a la vez.
- `services/bolsillos.js` bloquea el usuario y el bolsillo.
- `services/admin.js` bloquea el movimiento original y después las dos
  cuentas.
- Además, cada descuento se hace con `UPDATE ... WHERE disponible >= $monto`
  y se comprueba `rowCount`: si no cuadra, se aborta y hay `ROLLBACK`.

Dos transferencias simultáneas sobre la misma cuenta quedan
serializadas: la segunda espera, vuelve a leer el saldo ya descontado y
se rechaza si no alcanza. En el prototipo en memoria esto no existía.

---

## 5. Autenticación

`POST /api/auth/login` devuelve un JWT. Todas las rutas salvo
`/api/salud`, `/api/auth/registro` y `/api/auth/login` exigen la
cabecera:

```
Authorization: Bearer <token>
```

El token lleva `{doc, rol, cuenta}` y caduca a los 10 minutos. En cada
petición el middleware **relee el usuario de la base**: así un bloqueo
hecho por el administrador corta de inmediato una sesión ya abierta
(RN-07), sin esperar a que el token expire.

Errores: `{"error": "mensaje"}` con código 400 / 401 / 403 / 404 / 409 / 500.
Cuando un rechazo deja rastro (saldo insuficiente, exceso de tope), la
respuesta 400 incluye además `movimiento` y `motivo`.

---

## 6. Endpoints y pruebas con curl

Para abreviar, se guarda el token en una variable:

```bash
API=http://localhost:4000

TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"documento":"1023456789","clave":"maria123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo $TOKEN
```

En PowerShell:

```powershell
$r = Invoke-RestMethod -Method Post -Uri "$API/api/auth/login" -ContentType application/json `
      -Body '{"documento":"1023456789","clave":"maria123"}'
$TOKEN = $r.token
```

### Autenticación

```bash
# Registro (RF-01) -> 201
curl -i -X POST $API/api/auth/registro \
  -H 'Content-Type: application/json' \
  -d '{"doc":"1111222233","nombre":"Persona Nueva","clave":"clave12345",
       "correo":"persona@correo.com","tipo":"CC","nacimiento":"1995-05-10"}'

# Login (RF-02)
curl -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"documento":"1023456789","clave":"maria123"}'

# Cambio de contraseña (RF-06) — deja una alerta con fecha y hora
curl -X POST $API/api/auth/password \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"actual":"maria123","nueva":"nuevaClave1"}'
```

### Cuenta del cliente

```bash
# Estado de la cuenta: disponible, bolsillos, topes y cupos restantes
curl $API/api/cuenta/me -H "Authorization: Bearer $TOKEN"

# Topes diario y mensual (RF-04)
curl -X PUT $API/api/cuenta/topes \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"topeDiario":150000,"topeMensual":1000000}'

# Titular de una cuenta destino, para confirmar antes de enviar
curl $API/api/cuenta/009-441-220/titular -H "Authorization: Bearer $TOKEN"
# {"nombre":"Laura Díaz","tipo":"CE","doc":"1076543210"}

# Movimientos propios, con rango opcional
curl "$API/api/movimientos" -H "Authorization: Bearer $TOKEN"
curl "$API/api/movimientos?desde=2026-01-01&hasta=2026-12-31" -H "Authorization: Bearer $TOKEN"

# Alertas (RF-06)
curl $API/api/alertas -H "Authorization: Bearer $TOKEN"
```

### Dinero

```bash
# Transferencia válida -> 201
curl -X POST $API/api/transferencias \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cuentaDestino":"009-441-220","monto":100000,"nota":"Prueba"}'

# Saldo insuficiente -> 400 y movimiento Rechazada con su motivo
curl -X POST $API/api/transferencias \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cuentaDestino":"009-441-220","monto":99000000}'

# A la propia cuenta -> 400, sin movimiento
curl -X POST $API/api/transferencias \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cuentaDestino":"001-234-567","monto":1000}'

# Pago de convenio (EPM, Universidad, Acueducto, Claro)
curl -X POST $API/api/pagos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"convenio":"EPM","referencia":"10993821","valor":95400}'
```

### Bolsillos (RF-03 / RN-02)

```bash
curl $API/api/bolsillos -H "Authorization: Bearer $TOKEN"

curl -X POST $API/api/bolsillos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"nombre":"Estudio"}'

# el :id es el id numérico que devuelve la lista
curl -X POST $API/api/bolsillos/1/aportar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"monto":200000}'

curl -X POST $API/api/bolsillos/1/retirar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"monto":50000}'
```

### Administrador (RF-05)

```bash
ADMIN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"documento":"admin","clave":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# Buscar por documento, cuenta, correo o nombre (CA-05.1)
curl "$API/api/admin/usuarios" -H "Authorization: Bearer $ADMIN"
curl "$API/api/admin/usuarios?q=laura.diaz@correo.com" -H "Authorization: Bearer $ADMIN"
curl "$API/api/admin/usuarios?q=001-880-112" -H "Authorization: Bearer $ADMIN"

# Bloquear / reactivar (RN-07)
curl -X PATCH $API/api/admin/usuarios/1098765432/estado \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"estado":"bloqueada"}'

# Historial global con filtros
curl "$API/api/admin/movimientos?estado=Completada&tipo=Transferencia&cuenta=001-234-567" \
  -H "Authorization: Bearer $ADMIN"

# Devolución: crea movimiento nuevo enlazado, el original NO se edita (RN-05)
curl -X POST $API/api/admin/movimientos/TX-8844/devolucion -H "Authorization: Bearer $ADMIN"

# Cancelación: el original queda Cancelada
curl -X POST $API/api/admin/movimientos/TX-8845/cancelacion -H "Authorization: Bearer $ADMIN"
```

### Contable (RF-08, solo lectura)

```bash
CONTA=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"documento":"contable","clave":"conta123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl "$API/api/contable/resumen?desde=2026-01-01&hasta=2026-12-31" \
  -H "Authorization: Bearer $CONTA"
# {"ingresos":...,"egresos":...,"neto":...,"porTipo":[...],"porCliente":[...]}

# Movimientos de TODAS las cuentas en el rango (para el CSV global).
# Misma forma que /api/admin/movimientos. El admin también puede usarla.
curl "$API/api/contable/movimientos?desde=2026-01-01&hasta=2026-12-31" \
  -H "Authorization: Bearer $CONTA"

# RN-06: cualquier escritura le da 403
curl -i -X POST $API/api/transferencias -H "Authorization: Bearer $CONTA" \
  -H 'Content-Type: application/json' -d '{"cuentaDestino":"009-441-220","monto":1000}'
```

### Resumen del contrato

| método | ruta | rol |
|---|---|---|
| POST | `/api/auth/registro` | público |
| POST | `/api/auth/login` | público |
| POST | `/api/auth/password` | cualquiera autenticado |
| GET | `/api/cuenta/me` | usuario |
| PUT | `/api/cuenta/topes` | usuario |
| GET | `/api/cuenta/:cuenta/titular` | usuario |
| GET | `/api/movimientos?desde&hasta` | usuario |
| POST | `/api/transferencias` | usuario |
| POST | `/api/pagos` | usuario |
| GET | `/api/bolsillos` | usuario |
| POST | `/api/bolsillos` | usuario |
| POST | `/api/bolsillos/:id/aportar` | usuario |
| POST | `/api/bolsillos/:id/retirar` | usuario |
| GET | `/api/alertas` | usuario |
| GET | `/api/admin/usuarios?q=` | admin |
| PATCH | `/api/admin/usuarios/:doc/estado` | admin |
| GET | `/api/admin/movimientos?estado&tipo&cuenta` | admin |
| POST | `/api/admin/movimientos/:id/devolucion` | admin |
| POST | `/api/admin/movimientos/:id/cancelacion` | admin |
| GET | `/api/contable/resumen?desde&hasta` | contable |
| GET | `/api/contable/movimientos?desde&hasta` | contable y admin |
| GET | `/api/health` | público |
| GET | `/api/salud` | público (alias de `/api/health`) |

Añadidos sobre el contrato original, sin cambiar ninguna de las rutas
acordadas:

- **`GET /api/health`** — health check del despliegue, sin autenticación.
- **`GET /api/contable/movimientos?desde&hasta`** — historial global en
  un rango para el CSV del panel contable, con la misma forma que
  `/api/admin/movimientos`. Es de solo lectura, así que no rompe RN-06;
  el administrador también puede consultarla.
- `GET /api/bolsillos` — comodidad; la lista de bolsillos también viene
  dentro de `/api/cuenta/me`.
- `GET /api/salud` — alias histórico de `/api/health`.

---

## 7. Qué está verificado y qué no

**Honestidad sobre el alcance:** en este entorno no hubo una instancia
de PostgreSQL disponible, así que nada que toque la base de datos se
ejecutó. Esto es lo que sí se comprobó y lo que queda pendiente.

### Verificado (ejecutado de verdad)

- **`node --check` sobre todos los `.js` del proyecto**: pasa sin
  errores de sintaxis.
- **`npm test` → 51 pruebas, 51 en verde, 0 fallos** (runner nativo
  `node:test`, sin base de datos). Cubren:
  - montos: redondeo a pesos, rechazo de cero, negativo y texto;
  - cupos y topes RF-04: consumo del cupo, tope diario no mayor que el
    mensual, cupo nunca negativo;
  - la decisión completa de una transferencia
    (`evaluarTransferencia`): caso válido, monto igual al disponible,
    saldo insuficiente (con registro y motivo), monto cero/negativo
    (sin registro), destino bloqueado, destino inexistente, cuenta
    propia, exceso de tope diario y mensual, y el orden de precedencia
    entre saldo y topes;
  - validaciones de registro RF-01: documento, clave mínima, correo,
    nombre obligatorio y el límite exacto de los 18 años;
  - cambio de contraseña RF-06: longitud y "distinta a la actual";
  - bloqueo por intentos RNF-02: los 5 intentos y los 15 minutos;
  - rangos de fecha de los reportes y formato `dd/mm hh:mm`;
  - autorización: la matriz de permisos y los middlewares
    `requiereRol`, `requierePermiso` y `soloLecturaContable`,
    incluyendo que el contable no tiene ningún permiso de escritura
    (RN-06), que el admin no tiene permisos sobre saldos (RN-04) y que
    el historial global contable lo leen contable y admin pero no el
    cliente.

### Sin verificar (requiere PostgreSQL)

Todo lo siguiente está escrito y revisado a mano, pero **no se ejecutó
ni una vez**:

1. **`db/schema.sql`** no se aplicó a ningún motor. La sintaxis del DDL,
   los `CHECK`, los índices parciales y la secuencia `TX-####` están sin
   validar por PostgreSQL.
2. **`npm run migrate` y `npm run seed`** nunca corrieron. La
   comprobación de los $18.000.000 que hace el seed está programada pero
   no ejecutada.
3. **Ninguna consulta SQL** de `src/services/` se ejecutó: nombres de
   columna, los `FILTER (WHERE ...)`, los `LEFT JOIN`, los casts
   `$1::text` y el `VALUES` del desglose por tipo pueden tener errores
   que solo aparecen al conectarse. Esto incluye la consulta nueva de
   `GET /api/contable/movimientos` y el `SELECT 1` con el que
   `GET /api/health` reporta el estado de la base: la lógica de rol y
   permiso de ambas rutas sí está cubierta por `npm test`, pero su SQL
   no se ejecutó.
4. **El comportamiento transaccional** —`FOR UPDATE`, serialización de
   dos transferencias simultáneas, `ROLLBACK` ante fallo, ausencia de
   deadlock en A→B y B→A— es exactamente lo que más necesita una prueba
   real y es lo que no se pudo probar.
5. **bcrypt y jsonwebtoken** no se instalaron (`npm install` no se
   corrió), así que el hash de contraseñas y la firma/caducidad del JWT
   no se ejercitaron.
6. **Ningún endpoint HTTP** se llamó. Los ejemplos de curl de la sección
   6 están construidos desde el código, no copiados de una ejecución.
7. Las 47 pruebas de `calidad/tests/fintec.test.mjs` apuntan al
   prototipo HTML y no se adaptaron a este backend; se usaron como
   especificación de las reglas, y los casos CP que no dependen del DOM
   están replicados sobre `reglas.js` en `test/reglas.test.js`.

### Primeros pasos para cerrar esa brecha

```bash
npm install
npm run migrate && npm run seed      # valida el DDL y el seed
npm start
curl http://localhost:4000/api/salud
```

Después, una prueba de concurrencia que vale la pena en la
sustentación: lanzar dos transferencias del disponible completo a la
vez y comprobar que una se completa, la otra queda rechazada por saldo
insuficiente y el total del sistema sigue siendo $18.000.000.
