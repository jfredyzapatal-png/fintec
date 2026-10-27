# FINTEC — Billetera digital (proyecto académico)

Proyecto de **Ingeniería de Software 1** · Politécnico Grancolombiano.
Prototipo funcional de una plataforma bancaria web, con backend real, base de
datos PostgreSQL, autenticación en el servidor y despliegue en la nube.

> Maqueta académica. No es una institución financiera real. El dinero, las
> cuentas y los créditos existen solo para la sustentación.

**Despliegue en vivo:**
- Front: https://fintec-web.onrender.com
- API: https://fintec-api.onrender.com
- Salud del API: https://fintec-api.onrender.com/api/health

> La primera carga puede tardar ~1 minuto (plan gratuito de Render; el
> servicio duerme por inactividad).

---

## Qué contiene este repositorio

```
fintec/
├─ producto/       Prototipo original de una sola página (sin servidor)
│  └─ Fintec.html  No se modifica: 51 pruebas Vitest lo verifican tal cual
├─ web/            Front conectado a la API (desplegado en Render)
├─ api/            Backend Node 24 + Express 5 + PostgreSQL (desplegado)
├─ calidad/        Batería de pruebas Vitest y generador del plan de calidad
├─ deploy/         Guía y checklist de despliegue en Render
├─ docs/           Documentación del proyecto (ver índice más abajo)
└─ herramientas/   Scripts auxiliares
```

El prototipo (`producto/Fintec.html`) y la aplicación conectada (`web/` + `api/`
+ PostgreSQL) coexisten. El prototipo es la referencia visual y de reglas; la
aplicación real es lo que se defiende como entrega final del proyecto.

---

## Índice de documentación

| Documento | Para qué |
|---|---|
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Qué puede hacer cada rol (usuario, admin, contable) desde la interfaz |
| [`docs/REVISION_CALIDAD.md`](docs/REVISION_CALIDAD.md) | Revisión del cumplimiento del Plan de calidad y pruebas sobre v1.1.0 |
| [`docs/MODULO_CREDITO.md`](docs/MODULO_CREDITO.md) | Diseño, fórmulas y operación del módulo de créditos (v1.1.0) |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Visión de las tres capas, flujos de datos y decisiones técnicas |
| [`docs/MODELO_DATOS.md`](docs/MODELO_DATOS.md) | Tablas, restricciones e índices de PostgreSQL |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Contrato REST completo: rutas, cuerpos, códigos de respuesta |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Historia de versiones y cambios por versión |
| [`docs/PLAN_DE_TRABAJO.md`](docs/PLAN_DE_TRABAJO.md) | Plan original del incremento (documento histórico) |
| [`api/README.md`](api/README.md) | Puesta en marcha del backend (local y producción) |
| [`web/README.md`](web/README.md) | Puesta en marcha del front (local y producción) |
| [`deploy/GUIA_DESPLIEGUE.md`](deploy/GUIA_DESPLIEGUE.md) | Despliegue paso a paso en Render |
| [`deploy/CHECKLIST.md`](deploy/CHECKLIST.md) | Checklist operativa antes y después del despliegue |

---

## Usuarios de demostración

Mismas credenciales en todos los entornos (prototipo, local y producción).

### Clientes (rol `usuario`)

| Nombre | Documento | Clave | Número de cuenta |
|---|---|---|---|
| María Gómez | `1023456789` | `maria123` | `001-234-567` |
| Carlos Ruiz | `1098765432` | `carlos123` | `001-880-112` |
| Laura Díaz | `1076543210` | `laura123` | `009-441-220` |
| Andrés Pérez | `1045678901` | `andres123` | `008-990-455` |
| Valentina Soto | `1012334455` | `valentina123` | `001-556-330` |
| Julián Mesa | `1067889900` | `julian123` | `007-221-884` |

El **documento** es para iniciar sesión. El **número de cuenta** es lo que se
usa como destino de una transferencia entre usuarios.

### Operadores

| Nombre | Documento | Clave | Rol |
|---|---|---|---|
| Administrador | `admin` | `admin123` | `admin` |
| Contable | `contable` | `conta123` | `contable` |

Las claves están a la vista a propósito: es una maqueta académica. En la base
de datos se guardan hasheadas con bcrypt (RNF-02). Tras 5 intentos fallidos la
cuenta queda bloqueada 15 minutos; la sesión expira a los 10 minutos de
inactividad (RNF-01).

---

## Qué se puede hacer en la aplicación

### Público (sin iniciar sesión)
- Ver la landing con el valor comercial.
- **Simular una cuota** de crédito con tres tipos (libre inversión 2,5 % · vehículo 1,9 % · hipoteca 1,5 % mensual).
- Registrarse como nuevo cliente.
- Iniciar sesión.

### Usuario cliente
- Ver saldo disponible, bolsillos, cupo diario y mensual.
- **Transferir** a otra cuenta (confirmación en dos pasos con el nombre del titular).
- **Pagar servicios** a convenios (EPM, Universidad, Acueducto, Claro).
- **Crear bolsillos** de ahorro y mover dinero entre disponible y bolsillo.
- **Solicitar créditos** (libre inversión, vehículo o hipoteca), **pagar cuota** o **pagar total**.
- Ver movimientos, alertas y exportar su extracto a CSV.
- Ajustar sus topes diario y mensual.
- Cambiar su contraseña.

### Administrador
- Buscar clientes por documento, cuenta, correo o nombre.
- Bloquear o reactivar cuentas.
- Ver el historial global de movimientos.
- **Devolver** o **cancelar** transferencias ya completadas (RN-05).

### Contable (solo lectura)
- Resumen financiero por rango (ingresos, egresos, neto, desglose por tipo).
- Historial global de movimientos.
- Exportar reportes a CSV.

Detalle completo en [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md).

---

## Pila técnica

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 18 (Render Oregon) |
| Backend | Node.js 24 · Express 5 · `pg` (sin ORM) · `bcryptjs` · `jsonwebtoken` |
| Front | HTML/CSS/JS plano (sin bundler); mismas pantallas y CSS del prototipo |
| Pruebas | `node:test` nativo (51/51 en verde) · Vitest 51/51 contra el prototipo |
| Despliegue | Render (Web Service + Static Site + PostgreSQL, plan Free) |
| Autenticación | JWT HS256 con `exp 10m` + bcrypt con `COSTO=10` |

Decisiones de arquitectura y por qué: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## Correr todo en local

### 1. Base de datos
Crear una base PostgreSQL local llamada `fintec` y copiar `api/.env.example` a
`api/.env` rellenando `DATABASE_URL` y `JWT_SECRET`.

### 2. Backend
```bash
cd api
npm install
npm run migrate   # crea las tablas
npm run seed      # carga los 6 clientes, admin, contable y bolsillos
npm run dev       # arranca con recarga automática en :4000
```

Pruebas (no requieren PostgreSQL):
```bash
npm test          # 51 pruebas de reglas de negocio y autorización
```

### 3. Front
```bash
cd web
npx serve .       # o cualquier servidor estático; NO abrir con file://
```

Editar `web/config.js` para apuntar a `http://localhost:4000`.

### 4. Prototipo original (opcional)
Doble clic sobre `producto/Fintec.html` o:
```bash
cd producto
powershell -ExecutionPolicy Bypass -File serve.ps1   # Windows
```
Queda en http://localhost:8765.

Pruebas Vitest contra el prototipo:
```bash
cd calidad
npm install
npm test          # 51 pruebas con jsdom
```

---

## Correr contra la base de producción (desde local)

Útil para desarrollar o debuggear con datos reales:

```bash
cd api
$env:DATABASE_URL="<external url de Render>"
$env:JWT_SECRET="cualquier-cosa"
npm start
```

> **Importante:** la External Database URL contiene la clave de la base. Nunca
> commitearla. Se entrega al profesor por fuera del repositorio
> (ver `ENTREGA_A_CURSOR.md` **fuera** de este directorio).

---

## Despliegue

Desplegado en Render con tres servicios:
- `fintec-db` — PostgreSQL (plan Free, caduca 30 días después de creada)
- `fintec-api` — Web Service con `npm start`
- `fintec-web` — Static Site sirviendo `web/`

Pasos detallados: [`deploy/GUIA_DESPLIEGUE.md`](deploy/GUIA_DESPLIEGUE.md).
Checklist operativa: [`deploy/CHECKLIST.md`](deploy/CHECKLIST.md).

Para forzar un redespliegue:
```bash
git push origin main
# El web service y el static site tienen autoDeploy. Si no toman el commit,
# usar "Manual Deploy > Deploy latest commit" en el dashboard de Render.
```

Migraciones aditivas sin perder datos (p. ej. añadir la tabla `creditos`):
```bash
cd api
$env:DATABASE_URL="<external url>"
npm run migrate:creditos
```

---

## Estado del proyecto

- **v1.1.0** (actual) — módulo de créditos operativo, simulador con 3 tipos.
- **v1.0.0** — backend, front conectado y despliegue inicial.
- **Prototipo** — RF-01 a RF-08 implementados, 51 pruebas Vitest en verde.

Changelog completo: [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

### Verificación de calidad

| Suite | Entorno | Resultado |
|---|---|---|
| `api/npm test` | `node:test` sin BD | 51/51 ✅ |
| `calidad/npm test` | Vitest + jsdom contra el prototipo | 51/51 ✅ |
| E2E crédito en producción | HTTP real contra `fintec-api.onrender.com` | ✅ (ver [`docs/MODULO_CREDITO.md`](docs/MODULO_CREDITO.md)) |

---

## Equipo

Proyecto de 5 personas, metodología incremental. El plan original está en
[`docs/PLAN_DE_TRABAJO.md`](docs/PLAN_DE_TRABAJO.md) como documento histórico.
