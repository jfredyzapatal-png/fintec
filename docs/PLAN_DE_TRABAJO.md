# FINTEC — Plan de trabajo del siguiente incremento

Proyecto académico de Ingeniería de Software 1 — Politécnico Grancolombiano
Equipo de 5 personas · metodología incremental
Documento de planeación. Versión 1.

---

## 0. Punto de partida (estado verificado del código)

Todo lo que sigue se verificó leyendo `producto/Fintec.html` (1039 líneas),
`calidad/tests/fintec.test.mjs` y `calidad/data.js`.

| Hecho | Evidencia en el código |
|---|---|
| El producto es un único archivo HTML autocontenido, sin servidor | `producto/Fintec.html`; el README indica que se abre con doble clic sobre `file://` |
| Todo el estado vive en memoria y se pierde al recargar | `const BANCO = { usuarios: {}, movimientos: [], seq: 8840 }` (línea 297) |
| Los usuarios se siembran en código, con la contraseña en texto plano | 8 llamadas a `usuario('1023456789','maria123',…)` (líneas 313-321) |
| La autenticación compara cadenas en el navegador | `if (u && u.clave === val('lg-pass'))` en `entrar()` |
| El bloqueo por intentos y la inactividad son contadores en memoria | `intentosPorDoc`, `bloqueoPorDoc`, `temporizadorInactividad` |
| Los IDs de movimiento son un contador global en memoria | `nuevoId()` → `'TX-' + (++BANCO.seq)` |
| Hay 3 roles | `rol` ∈ `usuario`, `admin`, `contable`; mapa `ROL_PANTALLA` |
| El control de acceso por rol se hace en `go()`, en el cliente | líneas 982-1007 |
| Los bolsillos son un array embebido en el usuario | `bolsillos: [{nombre, saldo}]` |
| Las alertas son un array embebido en el usuario | `alertas: [{texto, ts}]` |
| Los topes son dos campos por usuario | `topeDiario`, `topeMensual`, por defecto `5 000 000` y `20 000 000` |
| Los convenios son una constante de 4 cadenas | `const CONVENIOS = ['EPM','Universidad','Acueducto','Claro']` |
| `origen` y `destino` de un movimiento son cadenas heterogéneas | pueden ser un número de cuenta, el nombre de un convenio o el nombre de un bolsillo |
| Las reversiones se enlazan con un campo suelto | `m.revertida`, `m.origenReversion` |
| La batería de pruebas tiene 47 casos (`it(...)`) con Vitest + jsdom | `calidad/tests/fintec.test.mjs`; al ejecutar `npm run cobertura` dentro de `calidad/` se regenera `calidad/evidencia/vitest-output.txt` con la salida completa y la tabla de cobertura por ramas |
| Las pruebas corren contra el producto entregado, no contra una copia | `tests/extract-core.mjs` extrae la lógica de `Fintec.html` en cada ejecución |

### Dos defectos detectados al leer el código para este plan

1. **`pintarAdminMovimientos` está referenciada pero no está definida.** Aparece
   en `PINTORES` (línea 959) y en `ROL_PANTALLA` (`'a-movimientos':'admin'`), pero
   no existe ninguna `function pintarAdminMovimientos`. Navegar a `a-movimientos`
   lanzaría un `TypeError`. Hoy no se alcanza porque ningún botón enlaza a esa
   pantalla, así que ninguna prueba lo cubre.
2. **RNF-02 no se cumple en la dimensión de hash.** El README y `calidad/data.js`
   lo reconocen: las claves están a la vista y el equipo dejó abierta la decisión
   de declarar el requisito "no verificable en este incremento". Este plan lo
   cierra.

Ambos se resuelven dentro del alcance descrito abajo. Este documento **no
modifica ningún archivo existente**.

---

## 1. Objetivo y alcance del siguiente incremento

### Objetivo

Convertir el prototipo de una sola página en una aplicación real de tres capas
—front-end, API REST y base de datos PostgreSQL— desplegada en Render, de modo
que el estado persista entre sesiones y la autenticación ocurra en el servidor
con contraseñas hasheadas.

### Alcance incluido

1. Base de datos PostgreSQL con el esquema del punto 3 y migraciones versionadas.
2. API REST en Node + Express que cubre RF-01 a RF-08 (punto 4).
3. Autenticación en el servidor: `bcrypt` para las claves (cierra RNF-02) y JWT
   para la sesión.
4. Autorización por rol **en el servidor**, no solo en la navegación del cliente.
5. Front-end: el mismo HTML, con la lógica de dominio sustituida por llamadas
   `fetch` a la API. Se conserva íntegro el CSS y la estructura de pantallas.
6. Migración del bloqueo por intentos fallidos y del cierre por inactividad a
   mecanismos que sobrevivan al recargado (columnas en `usuarios` + expiración
   del JWT).
7. Despliegue en Render: base de datos + web service + variables de entorno.
8. Adaptación de la batería de pruebas: las 47 pruebas actuales de dominio pasan
   a ser pruebas de la API; se añaden pruebas de integración contra una base de
   datos de prueba.
9. Corrección de los dos defectos listados arriba.

### Alcance excluido explícitamente

- Rediseño visual, cambio de paleta, tipografías o reordenación de pantallas.
- Nuevos requisitos funcionales (RF-09 y siguientes).
- Correo electrónico real para las notificaciones: las alertas siguen siendo
  registros en la aplicación, como hoy.
- Dinero real, pasarelas de pago, integración con convenios reales.
- App móvil nativa.
- Los `Pendiente` y `Procesada` que CA-04.1 exige y hoy nadie implementa: siguen
  siendo una decisión abierta del equipo y no entran en este incremento salvo
  que el cliente lo exija en el acta de aceptación.

### Criterios de aceptación del incremento

- Recargar el navegador no pierde ningún dato.
- Ninguna contraseña viaja ni se almacena en texto plano; `SELECT password_hash`
  devuelve cadenas `$2b$...`.
- Un `curl` directo a un endpoint de admin con el token de un usuario `usuario`
  devuelve `403`.
- La aplicación responde en una URL pública de Render.
- La batería de pruebas pasa en verde contra la API.

---

## 2. Arquitectura propuesta

### 2.1 De un archivo a tres capas

```
HOY                                   AL FINAL DEL INCREMENTO

┌───────────────────────────┐         ┌──────────────────────────┐
│      Fintec.html          │         │  web/  (estático)        │
│  ┌─────────────────────┐  │         │   index.html  (mismo CSS)│
│  │ CSS + pantallas     │  │         │   js/ui.js    (pintar*)  │
│  ├─────────────────────┤  │         │   js/api.js   (fetch)    │
│  │ BANCO (estado)      │  │  ───►   └───────────┬──────────────┘
│  ├─────────────────────┤  │                     │ HTTPS / JSON
│  │ lógica de negocio   │  │         ┌───────────▼──────────────┐
│  │ transferir(), etc.  │  │         │  api/  Node + Express    │
│  └─────────────────────┘  │         │   routes → services → db │
└───────────────────────────┘         └───────────┬──────────────┘
                                                  │ SQL
                                      ┌───────────▼──────────────┐
                                      │  PostgreSQL (Render)     │
                                      └──────────────────────────┘
```

La separación clave: hoy `transferir()` valida y mueve saldos en el mismo lugar
donde pinta HTML. Al final, `transferir()` en el cliente solo recoge el
formulario y hace `POST /api/transferencias`; la validación de saldo, topes y
estado de la cuenta vive en `api/services/transferencias.js` dentro de una
transacción SQL.

### 2.2 Pila recomendada

| Capa | Elección | Paquete npm |
|---|---|---|
| Runtime | Node.js 20 LTS | — |
| Framework HTTP | Express 4 | `express` |
| Driver de base de datos | pg (SQL directo, sin ORM) | `pg` |
| Hash de contraseñas | bcrypt | `bcrypt` |
| Sesiones | JWT | `jsonwebtoken` |
| Validación de entrada | Zod | `zod` |
| CORS | middleware oficial | `cors` |
| Cabeceras de seguridad | Helmet | `helmet` |
| Límite de peticiones | rate limit | `express-rate-limit` |
| Variables de entorno en local | dotenv | `dotenv` |
| Migraciones | node-pg-migrate | `node-pg-migrate` |
| Pruebas | Vitest (ya en uso) + Supertest | `vitest`, `supertest` |

Dependencias de producción, en una línea:

```bash
npm i express pg bcrypt jsonwebtoken zod cors helmet express-rate-limit dotenv
npm i -D vitest supertest node-pg-migrate
```

### 2.3 Por qué esta pila, para este equipo

- **Node + Express**: el equipo ya escribe JavaScript. Las 1039 líneas de
  `Fintec.html` y las 47 pruebas en `calidad/` son JavaScript. Cambiar de
  lenguaje obligaría a reescribir la lógica de dominio y la batería de pruebas
  desde cero. Express es el framework con más ejemplos y respuestas disponibles,
  lo que importa cuando nadie del equipo ha montado un backend antes.
- **PostgreSQL**: es la base de datos administrada que Render ofrece de forma
  nativa, con plan gratuito. Usar otra implicaría contratar un servicio aparte.
  Además el dominio es financiero: necesitamos `NUMERIC` exacto para los saldos
  y transacciones ACID para que una transferencia no deje dinero a medias.
- **`pg` sin ORM**: el esquema tiene 7 tablas y las consultas son simples. Un ORM
  añade una capa conceptual que el equipo tendría que aprender en paralelo. Con
  `pg` las transferencias se escriben como `BEGIN … COMMIT` explícito, que es
  exactamente lo que hay que entender y defender en la sustentación.
- **Vitest**: ya está configurado en `calidad/` con `vitest.config.mjs` y los
  scripts `test` y `cobertura`. Reusarlo conserva la infraestructura de
  cobertura y el mecanismo de mutación (`MUTAR=saldo npm test`).

### 2.4 Alternativas consideradas y descartadas

| Alternativa | Por qué no en este incremento |
|---|---|
| **Prisma / Sequelize / TypeORM** | Añade generación de clientes, un DSL de esquema propio y un paso de build. Con 7 tablas el costo de aprendizaje supera el beneficio, y oculta el SQL que el equipo debe mostrar en el entregable del modelo de datos. |
| **Firebase / Supabase** | Resuelven auth y persistencia casi sin backend, pero el enunciado pide diseñar un modelo relacional y una API; delegarlos deja al equipo sin el entregable técnico central. Supabase además es PostgreSQL, así que no ahorra aprender SQL. |
| **MongoDB** | Tentador porque `BANCO` ya es un objeto anidado, pero las transferencias necesitan actualizar dos cuentas e insertar un movimiento de forma atómica. En Mongo exige transacciones multi-documento sobre un replica set; en PostgreSQL es el comportamiento por defecto. |
| **NestJS** | Arquitectura sólida, pero impone decoradores, módulos, inyección de dependencias y TypeScript. Demasiado andamiaje para 5 personas con un parcial encima. |
| **SQLite** | Perfecta en local, pero el disco de Render es efímero en el plan gratuito del web service: la base se borraría en cada despliegue. Un disco persistente es de pago. |
| **Vercel / Netlify para la API** | Modelo serverless: cada función abre su propia conexión a PostgreSQL y agota el límite de conexiones del plan gratuito. Render corre un proceso largo con un pool de `pg`, que es lo que queremos. |
| **TypeScript** | Mejoraría el código, pero obliga a añadir un paso de compilación y a tipar las 1039 líneas migradas. Se propone como mejora de un incremento posterior. |

### 2.5 Estructura de carpetas propuesta

No se mueve ni se renombra nada de lo existente. Se añade:

```
fintec/
├─ producto/            SIN CAMBIOS — queda como el prototipo entregado
├─ calidad/             SIN CAMBIOS en lo existente; se añaden pruebas de API
├─ docs/
│  └─ PLAN_DE_TRABAJO.md
└─ app/                 NUEVO — la aplicación real
   ├─ api/
   │  ├─ src/
   │  │  ├─ server.js              arranque, helmet, cors, rutas
   │  │  ├─ db.js                  pool de pg
   │  │  ├─ middleware/auth.js     verifica JWT, expone req.usuario
   │  │  ├─ middleware/rol.js      exigeRol('admin'), exigeRol('contable')
   │  │  ├─ routes/*.js            un archivo por recurso
   │  │  ├─ services/*.js          reglas de negocio migradas de Fintec.html
   │  │  └─ schemas/*.js           validación Zod
   │  ├─ migrations/               node-pg-migrate
   │  ├─ tests/                    Vitest + Supertest
   │  ├─ .env.example
   │  └─ package.json
   └─ web/
      ├─ index.html                copia de Fintec.html, mismo CSS y pantallas
      └─ js/{api.js, ui.js}
```

---

## 3. Modelo de datos

### 3.1 Decisiones de modelado y de dónde salen

1. **`usuarios` y `cuentas` se separan.** Hoy el usuario *es* la cuenta: el campo
   `cuenta` y el saldo `disponible` cuelgan del mismo objeto. Separarlas permite
   que `admin` y `contable` existan sin cuenta bancaria (hoy tienen `cuenta: '—'`
   y `disponible: 0`, un valor centinela) y deja abierto que un cliente tenga más
   de una cuenta sin cambiar el esquema.
2. **`tipo` es el tipo de documento, no el tipo de cuenta.** El formulario de
   registro lo confirma: `<select id="rg-tipo"><option>CC</option><option>CE</option><option>PA</option></select>`
   junto al número de documento. Va en `usuarios`.
3. **Los saldos son `NUMERIC(16,2)`**, nunca `FLOAT`. El prototipo usa
   `Math.round(Number(...))` y trabaja en pesos enteros; `NUMERIC` lo soporta sin
   error de redondeo y deja margen si más adelante aparecen centavos.
4. **`movimientos.origen` y `movimientos.destino` se desdoblan.** Hoy son una
   sola cadena que puede ser un número de cuenta (`'001-880-112'`), un convenio
   (`'EPM'`) o el nombre de un bolsillo (`'Vacaciones'`). En la base se separa en
   una llave foránea a `cuentas` (nullable) más una etiqueta de texto para lo
   externo. Así el panel contable puede distinguir ingresos de egresos con un
   `JOIN` en vez de la heurística actual `porCuenta(m.destino)`.
5. **El ID visible `TX-8841` se conserva** como columna `codigo` derivada de una
   secuencia, porque las pruebas (CP-01, CP-23) y el CSV de RF-07 lo esperan. La
   llave primaria interna es un `BIGSERIAL`.
6. **Los topes van en `topes`, una fila por cuenta.** Podrían ser dos columnas de
   `cuentas`, pero una tabla propia permite guardar la fecha de la última
   modificación, que RF-04 y la alerta correspondiente ya muestran.
7. **`intentos_fallidos` y `bloqueado_hasta` pasan a `usuarios`.** Hoy son los
   objetos en memoria `intentosPorDoc` y `bloqueoPorDoc`, que se reinician al
   recargar la página — algo que el README reconoce y que vuelve RNF-02
   inverificable en producción.
8. **`convenios` se vuelve tabla.** Hoy es `const CONVENIOS` con 4 cadenas.
   Como tabla, el admin puede administrarlos sin tocar código.
9. **La reversión se enlaza con `movimiento_origen_id`**, llave foránea a la misma
   tabla, en lugar del campo suelto `m.origenReversion`.

### 3.2 DDL completo

```sql
-- ============================================================
-- FINTEC — esquema relacional
-- PostgreSQL 16
-- Derivado del objeto BANCO de producto/Fintec.html
-- ============================================================

BEGIN;

-- ---------- tipos enumerados ----------

CREATE TYPE rol_usuario      AS ENUM ('usuario', 'admin', 'contable');
CREATE TYPE tipo_documento   AS ENUM ('CC', 'CE', 'PA');
CREATE TYPE estado_cuenta    AS ENUM ('activa', 'bloqueada');
CREATE TYPE tipo_movimiento  AS ENUM ('Transferencia', 'Pago', 'Bolsillo',
                                      'Reversion', 'Cancelacion');
CREATE TYPE estado_movimiento AS ENUM ('Completada', 'Rechazada', 'Cancelada');

-- Nota: el prototipo escribe los tipos con tilde ('Reversión', 'Cancelación').
-- En la base se guardan sin tilde para evitar problemas de codificación; la
-- etiqueta con tilde se arma en la capa de presentación, que es donde ya vive
-- el resto del formato (fmt(), fechaCorta()).

-- ---------- usuarios ----------

CREATE TABLE usuarios (
  id                 BIGSERIAL      PRIMARY KEY,
  documento          VARCHAR(15)    NOT NULL,
  tipo_documento     tipo_documento NOT NULL DEFAULT 'CC',
  nombre             VARCHAR(120)   NOT NULL,
  correo             VARCHAR(160),
  nacimiento         DATE,
  rol                rol_usuario    NOT NULL DEFAULT 'usuario',
  password_hash      VARCHAR(72)    NOT NULL,
  estado             estado_cuenta  NOT NULL DEFAULT 'activa',
  intentos_fallidos  SMALLINT       NOT NULL DEFAULT 0,
  bloqueado_hasta    TIMESTAMPTZ,
  password_cambiada_en TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ    NOT NULL DEFAULT now(),

  -- RF-01: de 5 a 15 caracteres alfanuméricos, sin espacios
  CONSTRAINT usuarios_documento_formato
    CHECK (documento ~ '^[0-9A-Za-z]{5,15}$'),
  -- RF-01: formato de correo, equivalente a EMAIL_RE del prototipo
  CONSTRAINT usuarios_correo_formato
    CHECK (correo IS NULL OR correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  -- RF-01: mayor de 18 años y fecha razonable
  CONSTRAINT usuarios_mayor_de_edad
    CHECK (nacimiento IS NULL OR nacimiento <= (CURRENT_DATE - INTERVAL '18 years')),
  CONSTRAINT usuarios_nacimiento_razonable
    CHECK (nacimiento IS NULL OR nacimiento >= (CURRENT_DATE - INTERVAL '120 years')),
  CONSTRAINT usuarios_intentos_rango
    CHECK (intentos_fallidos BETWEEN 0 AND 5)
);

-- El login usa doc.toLowerCase(); el índice único debe ser insensible a mayúsculas
CREATE UNIQUE INDEX usuarios_documento_uk ON usuarios (lower(documento));
CREATE UNIQUE INDEX usuarios_correo_uk    ON usuarios (lower(correo)) WHERE correo IS NOT NULL;
-- RF-05 CA-05.1: el admin busca por nombre
CREATE INDEX usuarios_nombre_idx ON usuarios (lower(nombre));
CREATE INDEX usuarios_rol_idx    ON usuarios (rol);

-- ---------- cuentas ----------

CREATE TABLE cuentas (
  id           BIGSERIAL     PRIMARY KEY,
  usuario_id   BIGINT        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  numero       VARCHAR(20)   NOT NULL UNIQUE,
  disponible   NUMERIC(16,2) NOT NULL DEFAULT 0,
  estado       estado_cuenta NOT NULL DEFAULT 'activa',
  creado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- RN-01: el saldo disponible nunca queda en negativo
  CONSTRAINT cuentas_disponible_no_negativo CHECK (disponible >= 0),
  -- formato '001-234-567' del prototipo
  CONSTRAINT cuentas_numero_formato CHECK (numero ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}$')
);

CREATE INDEX cuentas_usuario_idx ON cuentas (usuario_id);
-- RF-05 CA-05.1: el admin busca por número de cuenta
CREATE INDEX cuentas_numero_idx  ON cuentas (numero);

-- ---------- topes de transferencia (RF-04) ----------

CREATE TABLE topes (
  cuenta_id      BIGINT        PRIMARY KEY REFERENCES cuentas(id) ON DELETE CASCADE,
  tope_diario    NUMERIC(16,2) NOT NULL DEFAULT 5000000,
  tope_mensual   NUMERIC(16,2) NOT NULL DEFAULT 20000000,
  actualizado_en TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT topes_positivos CHECK (tope_diario > 0 AND tope_mensual > 0),
  -- validación de guardarTopes(): el diario no puede superar al mensual
  CONSTRAINT topes_diario_menor_o_igual CHECK (tope_diario <= tope_mensual)
);

-- ---------- bolsillos (RF-03) ----------

CREATE TABLE bolsillos (
  id        BIGSERIAL     PRIMARY KEY,
  cuenta_id BIGINT        NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  nombre    VARCHAR(60)   NOT NULL,
  saldo     NUMERIC(16,2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT bolsillos_saldo_no_negativo CHECK (saldo >= 0)
);

-- crearBolsillo() rechaza nombres repetidos comparando en minúsculas
CREATE UNIQUE INDEX bolsillos_cuenta_nombre_uk ON bolsillos (cuenta_id, lower(nombre));

-- ---------- convenios (RF-04 pagos) ----------

CREATE TABLE convenios (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE,
  activo BOOLEAN     NOT NULL DEFAULT true
);

-- ---------- movimientos ----------

CREATE SEQUENCE movimiento_codigo_seq START WITH 8841;  -- BANCO.seq arranca en 8840

CREATE TABLE movimientos (
  id                   BIGSERIAL         PRIMARY KEY,
  codigo               VARCHAR(16)       NOT NULL UNIQUE
                         DEFAULT ('TX-' || nextval('movimiento_codigo_seq')),
  tipo                 tipo_movimiento   NOT NULL,
  estado               estado_movimiento NOT NULL,
  valor                NUMERIC(16,2)     NOT NULL,
  nota                 VARCHAR(200)      NOT NULL DEFAULT '',

  -- origen: cuenta propia, o etiqueta externa (nombre de bolsillo en un retiro)
  cuenta_origen_id     BIGINT            REFERENCES cuentas(id) ON DELETE RESTRICT,
  origen_etiqueta      VARCHAR(60),

  -- destino: cuenta propia, convenio, o nombre de bolsillo en un aporte
  cuenta_destino_id    BIGINT            REFERENCES cuentas(id) ON DELETE RESTRICT,
  destino_etiqueta     VARCHAR(60),
  convenio_id          SMALLINT          REFERENCES convenios(id),
  bolsillo_id          BIGINT            REFERENCES bolsillos(id) ON DELETE SET NULL,

  -- RF-05 / RN-05: reversiones y cancelaciones
  revertida            BOOLEAN           NOT NULL DEFAULT false,
  movimiento_origen_id BIGINT            REFERENCES movimientos(id) ON DELETE RESTRICT,

  ejecutado_por        BIGINT            REFERENCES usuarios(id),  -- quién disparó la operación
  creado_en            TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT movimientos_valor_positivo CHECK (valor > 0),
  -- cada extremo tiene exactamente una identidad: cuenta interna o etiqueta externa
  CONSTRAINT movimientos_origen_definido CHECK (
    (cuenta_origen_id IS NOT NULL) <> (origen_etiqueta IS NOT NULL)),
  CONSTRAINT movimientos_destino_definido CHECK (
    (cuenta_destino_id IS NOT NULL) <> (destino_etiqueta IS NOT NULL)),
  -- un Pago siempre apunta a un convenio; nada más lo hace
  CONSTRAINT movimientos_convenio_solo_en_pago CHECK (
    (tipo = 'Pago') = (convenio_id IS NOT NULL)),
  -- solo una reversión o cancelación apunta a un movimiento anterior
  CONSTRAINT movimientos_enlace_solo_en_reversion CHECK (
    movimiento_origen_id IS NULL OR tipo IN ('Reversion', 'Cancelacion')),
  CONSTRAINT movimientos_no_autoenlace CHECK (
    movimiento_origen_id IS NULL OR movimiento_origen_id <> id)
);

-- enviadoEn(): suma de transferencias completadas salientes del día y del mes
CREATE INDEX movimientos_topes_idx
  ON movimientos (cuenta_origen_id, tipo, estado, creado_en)
  WHERE tipo = 'Transferencia' AND estado = 'Completada';

-- mios(): extracto del usuario; RF-07 exporta por rango
CREATE INDEX movimientos_origen_fecha_idx  ON movimientos (cuenta_origen_id, creado_en DESC);
CREATE INDEX movimientos_destino_fecha_idx ON movimientos (cuenta_destino_id, creado_en DESC);

-- RF-08: el panel contable filtra completados por rango de fechas
CREATE INDEX movimientos_contable_idx ON movimientos (estado, creado_en)
  WHERE estado = 'Completada';

-- RF-05: lista de transferencias reversibles
CREATE INDEX movimientos_reversibles_idx ON movimientos (tipo, estado, revertida)
  WHERE tipo = 'Transferencia' AND estado = 'Completada' AND revertida = false;

-- ---------- alertas (RF-06) ----------

CREATE TABLE alertas (
  id            BIGSERIAL    PRIMARY KEY,
  usuario_id    BIGINT       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto         VARCHAR(300) NOT NULL,
  movimiento_id BIGINT       REFERENCES movimientos(id) ON DELETE SET NULL,
  leida         BOOLEAN      NOT NULL DEFAULT false,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- pintarAlertas() las muestra más recientes primero
CREATE INDEX alertas_usuario_fecha_idx ON alertas (usuario_id, creado_en DESC);

-- ---------- bitácora de sesión (soporte a RNF-02) ----------

CREATE TABLE intentos_login (
  id         BIGSERIAL   PRIMARY KEY,
  documento  VARCHAR(15) NOT NULL,
  exitoso    BOOLEAN     NOT NULL,
  ip         INET,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX intentos_login_doc_fecha_idx ON intentos_login (lower(documento), creado_en DESC);

COMMIT;
```

### 3.3 Semilla equivalente al estado inicial del prototipo

La semilla reproduce los 6 clientes, el admin, el contable, los bolsillos y los
3 movimientos sembrados por la IIFE `sembrar()`. **El hash se calcula en Node,
nunca se escribe a mano en el SQL**: `migrations/seed.js` llama a
`bcrypt.hash(clave, 12)` para cada uno. Las claves de demostración
(`maria123`, `admin123`, …) solo existen en `.env` local y en el README del
prototipo; en el despliegue real se generan aleatorias y se entregan al docente
por fuera del repositorio.

CP-44 exige que el sistema arranque con 6 clientes y 18 000 000 en total; la
semilla debe conservar esa suma para que la prueba siga siendo válida.

---

## 4. Endpoints de la API

Prefijo `/api`. Todas las respuestas son JSON. Códigos: `200` OK, `201` creado,
`400` validación, `401` sin sesión o sesión vencida, `403` rol insuficiente o
cuenta bloqueada, `404` recurso inexistente, `409` conflicto de regla de negocio
(saldo insuficiente, tope superado, movimiento ya revertido), `423` cuenta
bloqueada por intentos fallidos, `429` demasiados intentos.

| # | Método | Ruta | Qué hace | Rol | RF |
|---|---|---|---|---|---|
| 1 | POST | `/api/usuarios` | Registra un cliente: valida documento (5-15 alfanuméricos), unicidad, clave ≥ 8, correo, edad ≥ 18; crea la cuenta con saldo 0 y sus topes por defecto | público | RF-01 |
| 2 | POST | `/api/sesion` | Login: verifica con `bcrypt.compare`, incrementa `intentos_fallidos`, bloquea 15 min al quinto fallo, devuelve JWT y el rol. Mensaje genérico, no revela si falló el documento o la clave (CA-02.2) | público | RF-02 |
| 3 | DELETE | `/api/sesion` | Cierra sesión: invalida el token en la lista de revocación | autenticado | RF-02 |
| 4 | GET | `/api/yo` | Perfil del usuario en sesión: nombre, rol, cuenta, estado | autenticado | RF-02 |
| 5 | GET | `/api/cuentas/mia` | Disponible, total con bolsillos, cupo diario y mensual restantes | usuario | RF-03 |
| 6 | GET | `/api/bolsillos` | Lista los bolsillos de la cuenta con su saldo | usuario | RF-03 |
| 7 | POST | `/api/bolsillos` | Crea un bolsillo; rechaza nombre repetido en la misma cuenta | usuario | RF-03 |
| 8 | POST | `/api/bolsillos/:id/aportes` | Mueve dinero de disponible al bolsillo; rechaza si excede el disponible | usuario | RF-03 |
| 9 | POST | `/api/bolsillos/:id/retiros` | Mueve dinero del bolsillo al disponible; rechaza si excede el saldo del bolsillo | usuario | RF-03 |
| 10 | POST | `/api/transferencias/validacion` | Paso 1 de la confirmación de destinatario: valida cuenta, monto, topes y estado del destino; devuelve el nombre del titular **sin mover dinero** | usuario | RF-04 |
| 11 | POST | `/api/transferencias` | Paso 2: revalida todo y ejecuta en una transacción SQL (debita, acredita, registra el movimiento, genera las 2 alertas). Si falla por saldo o tope, registra el movimiento como `Rechazada` con el motivo | usuario | RF-04 |
| 12 | GET | `/api/convenios` | Lista los convenios activos para el selector de pagos | usuario | RF-04 |
| 13 | POST | `/api/pagos` | Paga a un convenio con referencia y valor; debita o registra `Rechazada` por saldo insuficiente | usuario | RF-04 |
| 14 | GET | `/api/topes` | Topes vigentes y lo enviado hoy y este mes | usuario | RF-04 |
| 15 | PUT | `/api/topes` | Actualiza los topes; exige positivos y diario ≤ mensual; genera alerta | usuario | RF-04 |
| 16 | GET | `/api/movimientos` | Extracto de las cuentas del usuario, con filtro `?desde&hasta` y paginación | usuario | RF-04 |
| 17 | GET | `/api/admin/usuarios?q=` | Busca clientes por documento, cuenta, correo o nombre | admin | RF-05 |
| 18 | PATCH | `/api/admin/usuarios/:id/estado` | Bloquea o desbloquea la cuenta; genera alerta; revoca los tokens activos de ese usuario (RN-07) | admin | RF-05 |
| 19 | GET | `/api/admin/movimientos` | Movimientos de todas las cuentas, con filtros. **Cierra el hueco de `pintarAdminMovimientos`, que hoy está referenciada sin definir** | admin | RF-05 |
| 20 | POST | `/api/admin/movimientos/:id/devolucion` | Crea la reversión enlazada, restituye saldos, deja el original en `Completada` como rastro de auditoría; rechaza si ya está revertido o si el destino no tiene saldo | admin | RF-05 |
| 21 | POST | `/api/admin/movimientos/:id/cancelacion` | Igual, pero deja el original en estado `Cancelada` (CA-04.1) | admin | RF-05 |
| 22 | PUT | `/api/yo/password` | Cambia la clave: verifica la actual con bcrypt, exige ≥ 8, distinta de la actual y confirmación igual; genera la alerta con fecha y hora | autenticado | RF-06 |
| 23 | GET | `/api/alertas` | Alertas del usuario, más recientes primero | autenticado | RF-06 |
| 24 | PATCH | `/api/alertas/:id` | Marca una alerta como leída | autenticado | RF-06 |
| 25 | GET | `/api/reportes/movimientos.csv?desde&hasta` | CSV del propio extracto, con la cabecera `ID;Fecha;Tipo;Origen;Destino;Valor;Estado` que CA-07.2 exige | usuario | RF-07 |
| 26 | GET | `/api/reportes/global.csv?desde&hasta` | CSV de todas las cuentas en el rango | contable | RF-07 |
| 27 | GET | `/api/contable/resumen?desde&hasta` | Ingresos, egresos, saldo neto y desglose por tipo de movimiento | contable | RF-08 |
| 28 | GET | `/api/contable/saldos` | Saldo actual por cliente: disponible, bolsillos y total | contable | RF-08 |
| 29 | GET | `/api/salud` | Comprueba la conexión a la base; usado por el monitor de Render | público | — |

Notas sobre el diseño:

- **La transferencia en dos pasos (10 y 11) refleja el flujo ya validado.** El
  prototipo muestra el nombre del titular antes de mover dinero (CP-38) y permite
  cancelar (CP-39). El endpoint 10 no tiene efectos; el 11 revalida todo, igual
  que `confirmarTransferencia()` hoy, porque entre ambos pasos el saldo o el
  estado del destino pueden haber cambiado.
- **El rol se verifica en el servidor**, con `exigeRol('admin')` en el router. El
  mapa `ROL_PANTALLA` del cliente se conserva para la navegación, pero deja de
  ser el control de seguridad: hoy un usuario que llame a `go('a-panel')` desde
  la consola es rechazado por el cliente (CP-36), lo que no protege nada una vez
  haya una API.
- **Toda cuenta bloqueada se rechaza en cada operación** (RN-07), no solo al
  navegar: los endpoints 7 a 15 comprueban `cuentas.estado` y `usuarios.estado`.

---

## 5. Seguridad

### 5.1 Hash de contraseñas con bcrypt — cierra RNF-02

Hoy el prototipo guarda la clave en claro (`usuario('1023456789','maria123',…)`)
y la compara en el navegador (`u.clave === val('lg-pass')`). El README lo asume
como deliberado para una maqueta sin servidor, y `calidad/data.js` registra que
el equipo consideró declarar RNF-02 no verificable. Con backend ya no hay excusa.

```js
// api/src/services/usuarios.js
import bcrypt from 'bcrypt';

const COSTO = 12;   // ~250 ms por hash en el plan gratuito de Render

export async function hashear(clave) {
  return bcrypt.hash(clave, COSTO);
}

export async function verificar(clave, hash) {
  return bcrypt.compare(clave, hash);
}
```

Reglas que el equipo debe respetar:

- La clave **nunca** se registra en logs, ni en `console.log`, ni en el cuerpo de
  una respuesta, ni en una URL.
- `password_hash` **nunca** sale en un `SELECT *` que llegue al cliente. Las
  consultas que alimentan respuestas enumeran columnas explícitamente.
- Los hashes de bcrypt miden 60 caracteres; la columna se declara `VARCHAR(72)`
  por margen.
- En el login, si el documento no existe se ejecuta un `bcrypt.compare` contra un
  hash señuelo antes de responder. Sin eso, el tiempo de respuesta delata qué
  documentos existen y el mensaje genérico de CA-02.2 pierde sentido.
- `bcrypt` compila código nativo. Si el build de Render falla por eso, la
  alternativa es `bcryptjs` (JavaScript puro, más lento pero sin compilación).

### 5.2 Sesiones con JWT

```js
// api/src/middleware/auth.js
import jwt from 'jsonwebtoken';

export function firmar(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol },     // nada sensible en el payload
    process.env.JWT_SECRET,
    { expiresIn: '10m', issuer: 'fintec-api' } // RNF-01: 10 min, como el prototipo
  );
}
```

- **`expiresIn: '10m'` reproduce RNF-01.** El prototipo cierra la sesión a los 10
  minutos de inactividad (`INACTIVIDAD_MS`). El cliente renueva el token en cada
  petición exitosa, de modo que los 10 minutos cuentan desde la última actividad
  real, igual que el `setTimeout` que se reinicia con cada clic.
- El payload lleva solo `sub` y `rol`. Un JWT va firmado, no cifrado: cualquiera
  puede leer su contenido en base64.
- **Lista de revocación** en memoria del proceso, con el `jti` de los tokens
  invalidados por logout o por bloqueo administrativo (RN-07 exige cerrar la
  sesión del usuario que el admin acaba de bloquear). Es suficiente para un
  único proceso; si en el futuro hay más de una instancia, hay que mover la
  lista a la base de datos o a Redis.
- El token se guarda en `sessionStorage`, no en `localStorage`: se borra al
  cerrar la pestaña y no queda disponible para otras pestañas. Una cookie
  `httpOnly` + `Secure` + `SameSite=Strict` sería más resistente a XSS, y es la
  mejora recomendada para el incremento siguiente; implica añadir protección CSRF.
- `express-rate-limit` sobre `POST /api/sesion`: 10 intentos por IP cada 15
  minutos, **además** del bloqueo por documento que exige RNF-02. Son controles
  distintos: uno limita al atacante, el otro protege la cuenta.

### 5.3 Variables de entorno

Ningún secreto en el repositorio. Se versiona `app/api/.env.example` con las
claves y sin los valores; `.env` entra en `.gitignore`.

```bash
# app/api/.env.example
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://usuario:clave@localhost:5432/fintec
JWT_SECRET=                      # openssl rand -base64 48
BCRYPT_COSTO=12
CORS_ORIGEN=http://localhost:5173
SEED_PASSWORD=                   # clave de los usuarios de demostración
```

`server.js` falla al arrancar si falta `DATABASE_URL` o `JWT_SECRET`. Es
preferible un error inmediato a un backend que firma tokens con `undefined`.

### 5.4 CORS

```js
import cors from 'cors';

const origenes = process.env.CORS_ORIGEN.split(',');

app.use(cors({
  origin: (origen, cb) =>
    (!origen || origenes.includes(origen))
      ? cb(null, true)
      : cb(new Error('Origen no permitido')),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
```

- Lista blanca explícita. **Nunca `origin: '*'`** en una API autenticada.
- En este incremento se recomienda servir el front-end estático desde el mismo
  web service de Render (`app.use(express.static('../web'))`). Mismo origen,
  CORS deja de ser un problema y el plan gratuito aguanta un solo servicio en
  lugar de dos.
- `helmet()` añade `X-Content-Type-Options`, `Referrer-Policy` y una CSP. Ojo: el
  prototipo usa `onclick` en atributos HTML y Google Fonts por CDN; la CSP hay
  que configurarla para no romper lo que ya funciona, o migrar los `onclick` a
  `addEventListener` durante la fase 4.
- Y una advertencia que ninguna cabecera resuelve: el prototipo arma HTML con
  concatenación de cadenas. Hay una función `esc()` y se usa en casi todos los
  puntos de inserción, pero al pasar a datos que vienen de la base **cada
  interpolación debe revisarse una por una**. Lo que hoy es una maqueta con datos
  sembrados mañana recibe el nombre que un atacante escribió en el registro.

---

## 6. Despliegue en Render

> **Sobre la exactitud de esta sección.** Render cambia los detalles de sus
> planes gratuitos con cierta frecuencia. Los pasos de la interfaz y los nombres
> de los campos son correctos a la fecha de este documento, pero **los límites
> concretos — cuánto almacenamiento trae la base gratuita, cuántos días vive, y
> el tiempo exacto de inactividad antes de dormir — hay que confirmarlos en el
> panel de Render y en su documentación de precios antes de la sustentación.**
> Lo que sí es estable y conviene dar por cierto: el plan gratuito del web
> service **duerme el servicio tras un período de inactividad** y la base
> gratuita **tiene fecha de caducidad**. El plan asume ambas cosas.

### Paso 1 — Crear la base de datos PostgreSQL

1. Panel de Render → **New** → **Postgres**.
2. Name `fintec-db`, Database `fintec`, User `fintec`.
3. Region: la misma que se usará para el web service. Si difieren, cada consulta
   cruza internet.
4. Plan: **Free**.
5. Al terminar, copiar de la página de la base:
   - **Internal Database URL** — para el web service. No sale a internet y no
     consume cuota de red.
   - **External Database URL** — para conectarse desde el portátil con `psql` o
     para correr migraciones a mano.

### Paso 2 — Probar la conexión y correr las migraciones

```bash
# desde el portátil, con la External Database URL
psql "postgresql://fintec:...@dpg-xxxx.oregon-postgres.render.com/fintec" -c "SELECT version();"

# migraciones
cd app/api
DATABASE_URL="<external url>" npx node-pg-migrate up
DATABASE_URL="<external url>" node migrations/seed.js
```

Render exige TLS en las conexiones externas. Si `psql` o `pg` fallan por el
certificado, el pool se configura así:

```js
// api/src/db.js
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,                      // el plan gratuito tiene pocas conexiones: no abrir 20
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});
```

### Paso 3 — Crear el Web Service

1. **New** → **Web Service** → conectar el repositorio de GitHub.
2. Root Directory: `app/api`.
3. Runtime: **Node**.
4. Build Command: `npm ci`.
5. Start Command: `npm start` (que es `node src/server.js`).
6. Plan: **Free**.
7. Health Check Path: `/api/salud`.

El servidor debe escuchar en el puerto que Render asigna, no en uno fijo:

```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`API en :${PORT}`));
```

Si el código ignora `process.env.PORT`, Render nunca detecta el servicio como
vivo y el despliegue se marca como fallido tras el tiempo de espera.

### Paso 4 — Variables de entorno en Render

En el web service → **Environment**:

| Clave | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | la **Internal** Database URL del paso 1 |
| `JWT_SECRET` | 48 bytes aleatorios; distinto del de desarrollo |
| `BCRYPT_COSTO` | `12` |
| `CORS_ORIGEN` | la URL pública del propio servicio |

`PORT` lo inyecta Render; no hay que declararla. Render reinicia el servicio al
guardar cualquier variable.

### Paso 5 — Migraciones en cada despliegue

Opción recomendada para este equipo: ejecutarlas en el arranque del servidor,
antes de `app.listen`.

```json
{ "scripts": { "start": "node-pg-migrate up && node src/server.js" } }
```

`node-pg-migrate` lleva su propia tabla de control, así que las migraciones ya
aplicadas no se repiten. Es la opción más simple y funciona con una sola
instancia. Con varias instancias simultáneas habría una condición de carrera, y
tocaría usar un Job separado de Render (que en el plan gratuito puede no estar
disponible — verificar).

La **semilla no va en el arranque**: se ejecuta una sola vez a mano desde el
portátil contra la External URL. Si se deja en el `start`, cada reinicio del
servicio intenta recrear los usuarios de demostración.

### Paso 6 — Convivir con el plan gratuito

**El servicio duerme tras un período de inactividad.** Esto tiene consecuencias
concretas para la sustentación:

- La primera petición después de dormir **tarda del orden de medio minuto a un
  minuto** en responder, porque Render tiene que levantar el contenedor de cero.
  No es un error, es el arranque en frío.
- **Despertar la aplicación 10 minutos antes de empezar a presentar.** Abrir la
  URL, hacer login, dejar una pestaña abierta.
- Añadir en el front-end un mensaje visible para la primera carga lenta —
  "Conectando con el servidor…" — para que el jurado no interprete el arranque
  en frío como que la aplicación está rota.
- **No usar un servicio externo de ping para mantenerla despierta.** Además de
  ser frágil, consume las horas gratuitas de ejecución del plan.
- Un arranque en frío reinicia el proceso y con él la **lista de revocación de
  tokens en memoria**. Efecto práctico: un token revocado por logout vuelve a ser
  válido hasta que expire. Con 10 minutos de vigencia el riesgo es acotado, pero
  hay que mencionarlo en la sustentación antes de que lo pregunten.

**La base de datos gratuita caduca.** Render borra las bases del plan gratuito
pasado un plazo desde su creación. El plazo exacto hay que confirmarlo en el
panel; lo que el equipo tiene que hacer, en cualquier caso:

- Apuntar en el calendario la fecha que Render muestre para esa base.
- Crearla **después** de tener las migraciones listas, no al principio del
  proyecto, para que el plazo no se consuma durante el desarrollo.
- Dejar en el repositorio un volcado de la semilla (`pg_dump` del esquema y de
  los datos de demostración) para poder reconstruirla en minutos si caduca antes
  de la entrega.

---

## 7. Plan por fases

5 personas. Las estimaciones son en días de calendario con dedicación parcial,
como corresponde a un semestre con otras materias encima.

### Asignación de roles

| Rol | Responsabilidad |
|---|---|
| **P1 — Base de datos** | DDL, migraciones, semilla, consultas |
| **P2 — API de dominio** | Transferencias, pagos, bolsillos, topes |
| **P3 — Seguridad y admin** | Auth, bcrypt, JWT, middleware de rol, endpoints de admin |
| **P4 — Front-end** | Migrar `Fintec.html` a cliente de la API |
| **P5 — Calidad y despliegue** | Adaptar las 47 pruebas, pruebas de integración, Render, documentación |

### Fase 0 — Preparación (2 días)

- Crear `app/api` y `app/web`; `package.json`, `.gitignore`, `.env.example`.
- PostgreSQL local para los 5 (Docker o instalador).
- **Congelar un contrato de API escrito** antes de programar: rutas, cuerpos de
  petición y respuesta, códigos de error. Sin esto, P2, P3 y P4 trabajan contra
  supuestos distintos y la integración se cae.
- Acordar convenciones: nombres en español en la base, respuestas de error con
  forma `{ error: { codigo, mensaje } }`.

**Paralelo:** los 5, juntos. Es la única fase que conviene hacer en reunión.

### Fase 1 — Base de datos (3 días)

- Escribir las migraciones con el DDL del punto 3.
- `seed.js` con los 6 clientes, el admin, el contable, los bolsillos y los 3
  movimientos iniciales, con bcrypt.
- Verificar CP-44: 6 clientes y 18 000 000 en total.
- Consultas de dominio en SQL puro, probadas con `psql`: cupo diario, cupo
  mensual, extracto, resumen contable.

**Responsable:** P1. **En paralelo:** P3 monta el esqueleto de Express con
`/api/salud`, helmet y cors; P5 crea la base en Render y el web service con un
"hola mundo" para validar el camino de despliegue antes de que haya código que
desplegar.

### Fase 2 — Autenticación y autorización (4 días)

- `POST /api/usuarios`, `POST /api/sesion`, `DELETE /api/sesion`, `GET /api/yo`.
- `bcrypt`, JWT, `middleware/auth.js`, `middleware/rol.js`.
- Bloqueo por 5 intentos durante 15 minutos, persistido en `usuarios`.
- `PUT /api/yo/password` con su alerta.
- Pruebas: equivalentes a CP-09 a CP-22, CP-30 a CP-32 contra la API.

**Responsable:** P3, con P5 en las pruebas. **En paralelo:** P2 empieza
transferencias contra un usuario de prueba fijo, sin esperar a que el login
funcione; P4 extrae el CSS y las pantallas de `Fintec.html` a `app/web` y monta
`api.js`.

> Esta fase es el cuello de botella: casi todo lo demás necesita un token. Si se
> atrasa, P2 y P4 siguen avanzando contra un token firmado a mano para pruebas.

### Fase 3 — Dominio (5 días)

- Transferencias en dos pasos, dentro de una transacción SQL.
- Pagos a convenios, bolsillos (crear, aportar, retirar), topes, extracto.
- Panel de admin: búsqueda, bloqueo, devolución, cancelación.
- Panel contable: resumen por rango, desglose por tipo, saldos por cliente.
- CSV de RF-07 con la cabecera exacta de CA-07.2.
- **Definir `GET /api/admin/movimientos`**, que cierra el defecto de
  `pintarAdminMovimientos`.

**Responsable:** P2 (usuario) y P3 (admin y contable), en paralelo sobre
archivos distintos. **En paralelo:** P5 escribe las pruebas de integración a
medida que los endpoints aparecen; P4 conecta las pantallas que ya tienen
endpoint.

### Fase 4 — Front-end conectado (4 días)

- Sustituir cada función de dominio por su llamada `fetch`.
- Manejo del token: guardarlo, enviarlo en `Authorization`, renovarlo, redirigir
  al login cuando llegue un `401`.
- Estados de carga y de error. El prototipo asume respuesta instantánea porque
  todo es memoria; con red hay espera y hay fallos.
- Mensaje de arranque en frío para la primera carga.
- Migrar los `onclick` en atributos a `addEventListener` si se activa la CSP.

**Responsable:** P4, con P2 resolviendo dudas del contrato. **En paralelo:** P1
revisa y crea los índices que falten según las consultas que resultaron; P5
despliega y ajusta variables de entorno.

### Fase 5 — Integración, pruebas y despliegue (4 días)

- Las 47 pruebas, adaptadas y en verde contra la API.
- Pruebas de integración con una base de datos de prueba que se crea y se
  destruye en cada corrida.
- Verificar las mutaciones: el equivalente de `MUTAR=saldo npm test` sigue
  haciendo fallar la prueba correspondiente.
- RNF-04: verificar en Chrome, Firefox y Edge — pendiente declarado en el README.
- Prueba de humo del despliegue: desplegar, esperar a que duerma, despertar,
  cronometrar el arranque en frío.
- Volcado de la base para poder reconstruirla.

**Responsable:** P5, con todos corrigiendo lo que aparezca.

### Fase 6 — Documentación y cierre (2 días)

- Actualizar `calidad/data.js` con los casos nuevos y regenerar el plan de
  calidad (`npm run doc`).
- Declarar **RNF-02 como cumplido y verificable**, con la prueba que lo
  demuestra.
- README del despliegue: URL, credenciales de demostración, aviso del arranque
  en frío.
- Acta de aceptación con el cliente — el otro pendiente del README.

**Responsable:** los 5.

### Resumen

| Fase | Días | Acumulado |
|---|---|---|
| 0 — Preparación | 2 | 2 |
| 1 — Base de datos | 3 | 5 |
| 2 — Autenticación | 4 | 9 |
| 3 — Dominio | 5 | 14 |
| 4 — Front-end | 4 | 18 |
| 5 — Integración y despliegue | 4 | 22 |
| 6 — Documentación | 2 | 24 |

**7 fases, 24 días de calendario.** El solapamiento descrito arriba lo baja a
unos **18 días reales** si el contrato de API se congela en la fase 0 y nadie lo
cambia sin avisar.

### Qué se puede paralelizar y qué no

| Se paraleliza bien | No se paraleliza |
|---|---|
| Base de datos (P1) y esqueleto de Express (P3) en la fase 1 | El contrato de API: tiene que estar acordado antes de que P2, P3 y P4 escriban una línea |
| Endpoints de usuario (P2) y de admin/contable (P3) en la fase 3, en archivos distintos | El middleware de auth: todo lo demás depende de él |
| Extracción del front-end (P4) desde la fase 2, antes de que la API esté lista | Las migraciones: dos personas editando el esquema al mismo tiempo generan conflictos difíciles de resolver. P1 es el único que las toca |
| Pruebas (P5) endpoint por endpoint, a medida que aparecen | La configuración de Render: una persona, P5, con los secretos en un solo lugar |

---

## 8. Riesgos y mitigación

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | El plan gratuito duerme y en la sustentación la primera carga tarda un minuto; el jurado cree que no funciona | Alta | Alto | Despertar la app 10 min antes; mensaje "Conectando con el servidor…"; explicarlo en la presentación antes de que lo pregunten; tener capturas o un video corto de respaldo |
| R-02 | La base de datos gratuita caduca antes de la entrega | Media | Crítico | Confirmar la fecha en el panel y anotarla en el calendario; crear la base solo cuando las migraciones estén listas; mantener un `pg_dump` del esquema y la semilla en el repositorio |
| R-03 | Una transferencia se interrumpe a medio camino y deja dinero descuadrado | Media | Crítico | `BEGIN … COMMIT` explícito en el servicio; `SELECT … FOR UPDATE` sobre las dos cuentas en orden de `id` para evitar interbloqueos; `CHECK (disponible >= 0)` como red de seguridad en la base; prueba de integración que lanza transferencias concurrentes y verifica que la suma total no cambia |
| R-04 | El contrato de API cambia a mitad del proyecto y el front-end deja de funcionar | Alta | Alto | Congelarlo en la fase 0 por escrito; cualquier cambio se anuncia en el grupo y lo aprueba quien consume el endpoint; versionar el archivo del contrato en el repositorio junto al código |
| R-05 | Una persona del equipo desaparece en semana de parciales | Alta | Medio | Rotar revisiones de código para que nadie sea el único que entiende una parte; la fase 2 (auth) la conocen P3 **y** P5 |
| R-06 | `bcrypt` no compila en el build de Render | Baja | Medio | Fijar Node 20 LTS en `engines`; si falla, cambiar a `bcryptjs` — mismo formato de hash, no requiere compilar, solo es más lento |
| R-07 | Se filtra un secreto al repositorio | Media | Alto | `.env` en `.gitignore` desde el primer commit; revisar `git log -p` buscando `JWT_SECRET` y `DATABASE_URL` antes de hacer el repositorio público; si ocurre, rotar la credencial en Render, no basta con borrar el archivo |
| R-08 | Las 47 pruebas se dan por perdidas al migrar y el proyecto pierde su mejor evidencia de calidad | Media | Alto | Migrarlas endpoint por endpoint en la fase 3, no al final; ninguna fase se cierra sin sus pruebas en verde; conservar `producto/Fintec.html` intacto para que las pruebas actuales sigan corriendo mientras la API se construye |
| R-09 | El pool de conexiones agota el límite del plan gratuito de PostgreSQL | Media | Medio | `max: 5` en el pool; una sola instancia del web service; liberar el cliente con `finally` en cada consulta |
| R-10 | Aparece XSS al pasar de datos sembrados a datos que escribe el usuario | Media | Alto | Revisar una por una todas las interpolaciones de `innerHTML` durante la fase 4; `esc()` obligatorio en cada campo que venga de la base; validación de entrada con Zod en el servidor; CSP vía helmet |
| R-11 | El equipo intenta rediseñar la interfaz "ya que estamos" y se pasa el plazo | Alta | Alto | El punto 9 es explícito: el diseño no se toca. Cualquier propuesta visual se anota para un incremento posterior |
| R-12 | El `expiresIn: '10m'` del JWT cierra la sesión en medio de una demostración | Media | Bajo | Renovar el token en cada respuesta exitosa, de modo que los 10 minutos cuenten desde la última actividad, igual que hoy |

---

## 9. Qué NO cambia

Esto es tan importante como lo que sí cambia. El prototipo ya pasó por una
revisión de diseño registrada en `calidad/data.js` ("Revisión de pantallas,
navegación y flujos del prototipo… OK tras corregir el control de rol en
`go()`") y por 47 pruebas. Lo validado se respeta.

### Diseño visual — intacto

- La hoja de estilos completa: las variables `--navy: #0B1E46`, `--blue: #1757D8`,
  `--sky: #27A6E6`, `--bg: #F3F7FC`, y todas las reglas derivadas.
- Las tipografías IBM Plex Sans y Syne desde Google Fonts.
- Los componentes: `.card`, `.btn.mint`, `.btn.ghost`, `.chip`, `.hero-card`,
  `.promo`, `.st.ok/.bad/.warn`, el `.toast`.
- El `@media (max-width: 900px)` y el comportamiento responsivo.
- La barra superior de prototipo y el pie de página.

El CSS se mueve de `<style>` a un archivo `.css` **sin editar una sola regla**.
Es un corte y pega literal, no un rediseño.

### Flujos de usuario — intactos

- **Transferencia en dos pasos**: validar → mostrar el nombre del titular →
  confirmar o cancelar. Es el flujo que CP-38 y CP-39 cubren y el que más valor
  tiene para el cliente. La API se diseñó alrededor de él (endpoints 10 y 11), no
  al contrario.
- **Las 7 pantallas de usuario** y su orden en la barra de navegación: Inicio,
  Enviar, Bolsillos, Pagar, Movimientos, Alertas, Exportar.
- **Las 2 pantallas de admin** y las **2 de contable**.
- Los **tres roles** con sus permisos actuales.
- El **punto de entrada por rol** al iniciar sesión: `usuario` → `u-inicio`,
  `admin` → `a-panel`, `contable` → `c-panel`.
- Los **mensajes de error, palabra por palabra**. Varias pruebas los verifican
  literalmente — CP-24 contra "Este movimiento ya fue revertido.", CP-29 contra
  "No tienes ese disponible", CP-12 contra el mensaje genérico de CA-02.2. Si el
  backend devuelve otro texto, la prueba falla con razón: el requisito hablaba de
  ese mensaje.
- El **comportamiento del toast**: 2600 ms y desaparece.
- La **exportación CSV** con separador `;`, BOM UTF-8 y la cabecera
  `ID;Fecha;Tipo;Origen;Destino;Valor;Estado`.
- El **formato de moneda** `$2.450.000` (`toLocaleString('es-CO')`) y el de fecha
  corta `dd/mm hh:mm`.
- El **formato del ID de movimiento** `TX-8841`.
- El **cierre de sesión a los 10 minutos** de inactividad (RNF-01).
- El **bloqueo de 15 minutos tras 5 intentos** fallidos (RNF-02).

### El prototipo entregado — intacto

`producto/Fintec.html` **no se modifica**. Queda como el entregable del
incremento anterior y como la referencia visual del nuevo. Mientras la API se
construye, las 47 pruebas actuales siguen corriendo contra él, porque
`tests/extract-core.mjs` extrae la lógica de ese archivo. Perder esa red de
seguridad durante la migración sería el peor momento posible para quedarse sin
pruebas.

La aplicación nueva vive en `app/`. Son dos cosas distintas en el repositorio, y
eso es deliberado.
