# Guía de despliegue de FINTEC en Render

Guía para alguien que nunca ha usado Render. Sigue los pasos en orden.
Tiempo estimado la primera vez: **40 a 60 minutos**.

Toda la información de plataforma de esta guía está verificada contra la
documentación oficial de Render (enlaces al final). Lo que **no** pudimos
confirmar está marcado con `[NO CONFIRMADO]` — verifícalo tú antes de
depender de ello.

---

## ⚠️ ADVERTENCIA CRÍTICA — LA BASE DE DATOS GRATUITA SE BORRA

Lee esto **antes** de empezar, porque afecta cómo planifican la sustentación.

Según la documentación oficial de Render:

- **Una base PostgreSQL del plan gratuito expira 30 días después de haber
  sido creada.** No 30 días de inactividad: 30 días desde su creación, pase
  lo que pase.
- Una base expirada **queda inaccesible**: la API dejará de funcionar y
  mostrará errores de conexión.
- Después de expirar hay un **periodo de gracia de 14 días** para pasarla a
  un plan de pago. **Pasado ese periodo, Render borra la base de datos y
  todos sus datos.**
- Las bases gratuitas **no tienen backups de ningún tipo**. Nadie los va a
  hacer por ustedes.
- Solo se permite **una base gratuita activa por workspace**.
- El almacenamiento es fijo: **1 GB**.
- Render **puede reiniciar** una base gratuita en cualquier momento.

### Qué hacer al respecto

1. **Anoten la fecha de creación de la base** en el `CHECKLIST.md` y en el
   grupo del equipo, junto con la fecha de expiración (creación + 30 días).
2. **Si la sustentación es a más de 25 días del despliegue**, no despliegues
   la base todavía, o prepárate para recrearla. Lo más seguro:
   **crear la base entre 1 y 5 días antes de la sustentación.**
3. **Guarden un dump antes de cada entrega**, desde su computador:
   ```bash
   pg_dump "<EXTERNAL_DATABASE_URL>" > fintec_backup_AAAA-MM-DD.sql
   ```
   Si después hay que recrear la base:
   ```bash
   psql "<NUEVA_EXTERNAL_DATABASE_URL>" < fintec_backup_AAAA-MM-DD.sql
   ```
   Guarden también el script de `seed`: si todo falla, `npm run migrate` +
   `npm run seed` reconstruye la base desde cero.
4. **Si recrean la base**, el `DATABASE_URL` cambia. Si la crearon con el
   Blueprint y usan `fromDatabase`, Render reconecta la variable solo; si la
   crearon a mano, hay que volver a pegar la cadena de conexión.
5. Si el trabajo debe quedar en línea varios meses, la única solución real es
   pagar el plan más bajo de PostgreSQL, o usar otro proveedor para la base.

---

## Otros límites del plan gratuito (confirmados en la documentación)

**Web Service gratuito (la API):**
- Render **suspende el servicio después de 15 minutos sin tráfico entrante**.
- Volver a levantarlo tarda **alrededor de un minuto**, y durante ese minuto
  el navegador ve una pantalla de carga. **El día de la sustentación, abran
  la API 2 o 3 minutos antes de mostrarla**, para que ya esté despierta.
- El workspace recibe **750 horas gratuitas de instancia por mes
  calendario**. No se acumulan de un mes al siguiente.
- El sistema de archivos es **efímero**: lo que el servicio escriba en disco
  se pierde en cada redeploy, reinicio o suspensión. No guarden nada
  importante en archivos; todo va a PostgreSQL.
- **No hay acceso a consola (shell/SSH) en el plan gratuito.** Esto es
  importante para las migraciones: ver paso 7.
- **No hay comando pre-deploy** en el plan gratuito (la documentación dice
  que está disponible para web services, private services y background
  workers **de pago**).
- Sí admiten dominio propio con certificado TLS gestionado.

**Static Site (el front):**
- Desplegarlo es gratis y no se suspende por inactividad.
- Consume del ancho de banda saliente y de los minutos de pipeline incluidos
  en el workspace. `[NO CONFIRMADO]` La página de planes gratuitos **no da
  las cifras concretas** de ancho de banda ni de minutos de build. Si les
  importa el número exacto, mírenlo en **Billing** dentro del dashboard de
  Render.

`[NO CONFIRMADO]` No encontramos en la documentación que las **bases de
datos** gratuitas se suspendan por inactividad. La suspensión a los 15
minutos está documentada para **web services**, no para bases. No asuman
ninguno de los dos comportamientos sin comprobarlo.

---

## Paso 1 — Preparar el repositorio en GitHub

Render despliega desde un repositorio Git. Antes de tocar Render:

1. El repositorio debe estar en GitHub (puede ser privado).
2. La estructura debe ser:
   ```
   /
   ├── api/            <- backend Node + Express
   │   ├── package.json         (scripts: start, migrate, seed)
   │   ├── package-lock.json    <- NECESARIO si usan "npm ci"
   │   └── .env.example
   ├── web/            <- front estático
   │   └── index.html
   └── render.yaml     <- copiado desde deploy/render.yaml
   ```
3. **Copia `deploy/render.yaml` a la raíz del repositorio.** Render busca
   `render.yaml` en la raíz por defecto. Si prefieren dejarlo en `deploy/`,
   al crear el Blueprint hay que escribir la ruta `deploy/render.yaml` en el
   campo del formulario.
4. Verifiquen que **`.env` está en `.gitignore`** y que no hay secretos
   commiteados. Si subieron un `JWT_SECRET` real al repo, cámbienlo.
5. `git push` a la rama `main`.

---

## Paso 2 — Crear la cuenta de Render

1. Entra a <https://render.com> y pulsa **Get Started** / **Sign Up**.
2. Elige **Sign up with GitHub**. Es lo más simple: así Render queda
   autorizado para leer los repositorios en el mismo paso.
3. Confirma el correo si Render lo pide.
4. Render crea un **workspace** (antes "team"). Todos los límites gratuitos
   —las 750 horas, la única base gratuita— son **por workspace**, no por
   servicio. Si el equipo crea cada uno su cuenta, cada uno tiene sus propios
   límites, pero entonces solo esa persona puede administrar el despliegue.
   **Recomendación: una sola cuenta/workspace para el proyecto**, y añadir a
   los compañeros como miembros.

---

## Paso 3 — Conectar el repositorio de GitHub

Si se registraron con GitHub, buena parte ya está hecho. Para completar:

1. En el dashboard, arriba a la derecha: **New +**.
2. Al elegir cualquier tipo de servicio, Render muestra la lista de
   repositorios. Si el suyo **no aparece**:
   - Pulsa **Configure account** / **Credentials** (o "+ Connect account").
   - GitHub abre la pantalla de instalación de la *GitHub App* de Render.
   - Elige **Only select repositories** y marca el repo de FINTEC.
     (Es más seguro que dar acceso a todos).
   - **Install / Save**.
3. Si el repositorio pertenece a una **organización** de GitHub, un
   administrador de esa organización tiene que aprobar la instalación.
4. Vuelve a Render y refresca: el repositorio ya debe aparecer.

---

## Paso 4 — Crear la base de datos PostgreSQL

Puedes dejar que el Blueprint la cree (paso 5) o crearla a mano. **Crearla a
mano primero es recomendable** porque así puedes correr las migraciones antes
de que la API arranque y falle.

1. **New + > Postgres**.
2. Rellena:
   - **Name**: `fintec-db`
   - **Database**: `fintec` (el nombre de la base dentro del motor)
   - **User**: `fintec`
   - **Region**: `Oregon (US West)` — **anota cuál eliges**. La API debe ir
     en **la misma región** o no podrá usar la conexión interna.
   - **PostgreSQL Version**: `17` (o la que acuerden; no se puede cambiar
     después).
   - **Instance Type / Plan**: **Free**.
3. **Create Database**. Tarda 1–2 minutos en quedar en estado
   **Available**.
4. **📌 ANOTA LA FECHA DE HOY.** Expira en 30 días. Apúntalo en el
   `CHECKLIST.md`.

### De dónde se copia la cadena de conexión

En la página de la base, en la pestaña **Info**, sección **Connections**
(también desde el botón **Connect**, arriba a la derecha). Hay dos cadenas y
**no son intercambiables**:

| Etiqueta en el dashboard | Cuándo se usa | Forma |
|---|---|---|
| **Internal Database URL** | Desde **otros servicios de Render en la misma región**. Pasa por la red privada, es más rápida. Es la que usa la API. | hostname corto, sin dominio público |
| **External Database URL** | Desde **cualquier otra parte**: tu portátil, pgAdmin, DBeaver, GitHub Actions. Sale a internet público. | hostname largo terminado en `.render.com` |

Notas confirmadas en la documentación:
- Las conexiones **externas van siempre cifradas** con TLS gestionado por
  Render, y Render **rechaza `sslmode=disable`**. Usa `sslmode=require`.
- En las conexiones **internas** el TLS es opcional y con certificado
  autofirmado: `sslmode=verify-ca` y `sslmode=verify-full` **no** están
  soportados. Si quieren TLS interno, `sslmode=require`.
- La **IP Allow List** está en **Info > Networking**. Su valor por defecto es
  `0.0.0.0/0`, es decir **cualquier IP** puede intentar conectarse (la
  protección es solo la contraseña). Solo aplica a conexiones externas.
- Usen el **hostname externo completo**, nunca la IP resuelta, o verán
  `FATAL: No SNI information found`.
- `[NO CONFIRMADO]` La documentación **no dice** que la URL externa caduque.

**Lo que hay que copiar para el paso 7 (migraciones):** la **External
Database URL**. Guárdala en un gestor de contraseñas o en un chat privado del
equipo; **no la pongan en el repositorio**.

---

## Paso 5 — Crear la API y el front con el Blueprint

Esta es la vía recomendada: un solo formulario crea API + front y conecta las
variables de entorno.

1. **New + > Blueprint**.
2. Selecciona el repositorio de FINTEC.
3. **Branch**: `main`.
4. Si dejaron `render.yaml` dentro de `deploy/`, escribe
   `deploy/render.yaml` en el campo de ruta del archivo. Si está en la raíz,
   déjalo vacío.
5. Render lee el archivo y muestra los recursos que va a crear:
   `fintec-api`, `fintec-web`, `fintec-db`.
   - Si **ya creaste la base en el paso 4** con el nombre `fintec-db`, Render
     la reutiliza en lugar de crear otra. Si creaste la base con otro nombre,
     **edita el `render.yaml`** para que `databases[].name` y
     `fromDatabase.name` coincidan, o Render intentará crear una segunda base
     gratuita y fallará (solo se permite una por workspace).
6. Render pedirá el valor de las variables marcadas `sync: false`. La única
   es **`CORS_ORIGIN`**. Todavía no conoces la URL del front, así que escribe
   `*` por ahora y corrígela en el paso 9.
7. **Apply / Create resources**.

### Si prefieren hacerlo a mano (sin Blueprint)

Para la API: **New + > Web Service** > repositorio > y rellenar:

| Campo | Valor |
|---|---|
| Name | `fintec-api` |
| Language / Runtime | `Node` |
| Branch | `main` |
| Region | la **misma** que la base de datos |
| Root Directory | `api` |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path | `/api/health` (solo si ese endpoint existe) |

Para el front: **New + > Static Site** > repositorio > y rellenar:

| Campo | Valor |
|---|---|
| Name | `fintec-web` |
| Branch | `main` |
| Root Directory | `web` |
| Build Command | *(vacío, o `echo ok`)* |
| Publish Directory | `.` |

---

## Paso 6 — Configurar las variables de entorno de la API

Si usaron el Blueprint, ya están puestas. Para revisarlas o añadirlas:
servicio `fintec-api` > pestaña **Environment** > **Environment Variables**.

Según el `.env.example` de la API, el mínimo es:

| Variable | Valor | De dónde sale |
|---|---|---|
| `DATABASE_URL` | la **Internal** Database URL | Si usan Blueprint, Render la inyecta sola con `fromDatabase`. A mano: cópienla de Info > Connections de la base. |
| `JWT_SECRET` | cadena aleatoria larga | Blueprint: `generateValue: true` la genera. A mano: `openssl rand -base64 32` y pegar el resultado. **Nunca** uses `secret`, `123456` ni nada del repo. |
| `PORT` | `10000` | Render inyecta `PORT` automáticamente. El código **debe** leer `process.env.PORT`. |
| `NODE_ENV` | `production` | |
| `NODE_VERSION` | `24` | `NODE_VERSION` tiene prioridad sobre `.node-version`, `.nvmrc` y `engines` de `package.json`. El default actual de Render para servicios nuevos ya es una versión 24.x, pero fijarlo evita sorpresas. |
| `CORS_ORIGIN` | la URL del Static Site | Se rellena en el paso 9. |

Cada vez que guardan una variable, Render **re-despliega** el servicio.

---

## Paso 7 — Migraciones y seed (la primera vez)

**Aquí está el punto difícil del plan gratuito.** La documentación oficial
confirma que los **servicios gratuitos no tienen acceso a shell (ni Dashboard
Shell ni SSH)** y que el **comando pre-deploy es solo para planes de pago**.
Es decir: **no pueden abrir una terminal en Render y escribir
`npm run migrate`.**

Tienen tres opciones. La **A** es la más recomendable para un trabajo
académico.

### Opción A — Correr las migraciones desde su computador (recomendada)

1. Abran **Info > Networking** de la base y confirmen que la IP Allow List
   permite su IP (por defecto `0.0.0.0/0` permite todas; si la cerraron,
   añadan su IP o `0.0.0.0/0` temporalmente).
2. En su máquina, dentro de `api/`:
   ```bash
   cd api
   npm install
   # Windows PowerShell:
   $env:DATABASE_URL="<EXTERNAL_DATABASE_URL>?sslmode=require"
   # macOS / Linux:
   export DATABASE_URL="<EXTERNAL_DATABASE_URL>?sslmode=require"

   npm run migrate
   npm run seed
   ```
3. Verifiquen que las tablas existen:
   ```bash
   psql "<EXTERNAL_DATABASE_URL>" -c "\dt"
   ```
4. **Vuelvan a cerrar la IP Allow List** si la habían abierto.

Ventaja: ven los errores de las migraciones directamente en su terminal, lo
cual es mucho más fácil de depurar que leerlos en los logs de Render.

### Opción B — Añadir la migración al Build Command (solo el primer deploy)

Cambien temporalmente el Build Command de `fintec-api` a:

```
npm ci && npm run migrate && npm run seed
```

Lanzan un **Manual Deploy**, confirman en los logs que las migraciones
pasaron, y **vuelven a dejar el Build Command en `npm ci --omit=dev`**.

⚠️ Si lo dejan permanentemente, el `seed` se ejecutará en **cada** deploy y
puede duplicar o borrar datos. Solo sirve si las migraciones son
idempotentes.

### Opción C — Un Job de Render

Render documenta los *one-off jobs* precisamente para correr migraciones, y
dice que se crean por API o CLI, no desde el dashboard.
`[NO CONFIRMADO]` **No pudimos confirmar si los one-off jobs están
disponibles en el plan gratuito.** No cuenten con esta opción sin verificarla.

---

## Paso 8 — Comprobar que la API responde

1. Servicio `fintec-api` > arriba aparece su URL, del tipo
   `https://fintec-api.onrender.com`. Cópienla.
2. Esperen a que el estado sea **Live** (verde).
3. Corran el script de verificación incluido en esta carpeta:
   ```bash
   # macOS / Linux / Git Bash
   bash deploy/verificar.sh https://fintec-api.onrender.com

   # Windows PowerShell
   .\deploy\verificar.ps1 -BaseUrl https://fintec-api.onrender.com
   ```
   La primera petición puede tardar **~1 minuto** si el servicio estaba
   suspendido. Es normal.

---

## Paso 9 — Apuntar el front a la URL de la API

El front es estático: no tiene variables de entorno en tiempo de ejecución.
La URL de la API tiene que quedar **escrita en el código JavaScript**.

1. En `web/`, busquen dónde está definida la URL base. Lo habitual es un
   archivo de configuración, por ejemplo `web/js/config.js`:

   ```js
   // Detecta automáticamente si estamos en local o en producción.
   const API_BASE_URL =
     location.hostname === "localhost" || location.hostname === "127.0.0.1"
       ? "http://localhost:10000"
       : "https://fintec-api.onrender.com";   // <-- URL real del Web Service
   ```

   Esto es mejor que hardcodear una sola URL: el mismo código funciona en
   local y en Render sin editar nada.

   > Si el front usa un bundler más adelante, lo correcto sería una variable
   > de build (`VITE_API_URL`) declarada en los `envVars` del Static Site.
   > Con HTML plano, no hay forma de inyectarla: va en el código.

2. Hagan `git push`. El Static Site se re-despliega solo.
3. Copien la URL del Static Site (`https://fintec-web.onrender.com`) y
   pónganla en la variable **`CORS_ORIGIN`** de `fintec-api`
   (Environment > editar > Save). Esperen el re-deploy.
4. Abran el front, intenten iniciar sesión, y revisen la consola del
   navegador (**F12 > Console** y **Network**). Si ven un error de CORS, el
   `CORS_ORIGIN` no coincide: tiene que ser el origen exacto, **sin barra
   final** (`https://fintec-web.onrender.com`, no
   `https://fintec-web.onrender.com/`).

---

## Qué revisar en los logs cuando algo falle

Los logs están en cada servicio, pestaña **Logs**. Hay dos pestañas distintas
y conviene saber cuál mirar: **Events** (historial de deploys) y **Logs**
(salida del proceso). Para errores de build, abran el deploy concreto desde
**Events** y lean su log completo.

### El build falla

| Lo que ven en el log | Causa probable | Solución |
|---|---|---|
| `npm ERR! code ENOENT ... package.json` | El **Root Directory** no apunta a `api`. | Settings > Root Directory = `api`. |
| `npm ci can only install with an existing package-lock.json` | Falta el lockfile en el repo. | Commitear `api/package-lock.json`, o cambiar el build a `npm install`. |
| `Unsupported engine` / `requires Node >=X` | Versión de Node incorrecta. | Poner `NODE_VERSION=24`. |
| `Cannot find module '<algo>'` en el **start**, no en el build | La dependencia está en `devDependencies` pero el build usó `--omit=dev`. | Moverla a `dependencies`, o quitar `--omit=dev`. |
| `bcrypt` / `node-gyp` falla al compilar | `bcrypt` necesita compilación nativa. | Usar `bcryptjs` (JS puro), o fijar una versión de `bcrypt` con binarios precompilados para esa versión de Node. |

### El deploy se queda en "In progress" y luego "Timed out"

Render espera a que el proceso **abra un puerto**. Las dos causas casi
siempre son:

1. El servidor escucha un puerto fijo en vez de `process.env.PORT`.
   Debe ser:
   ```js
   const port = process.env.PORT || 3000;
   app.listen(port, "0.0.0.0", () => console.log(`API en :${port}`));
   ```
2. El servidor escucha en `127.0.0.1` / `localhost` en vez de `0.0.0.0`.
   Desde fuera del contenedor eso es invisible.

### El servicio arranca y se cae en bucle ("Deploy failed" / reinicios)

Busquen en **Logs** la última línea antes del reinicio:

| Mensaje | Significado |
|---|---|
| `ECONNREFUSED` / `ENOTFOUND` + hostname de la base | `DATABASE_URL` mal puesta, o la API y la base están en **regiones distintas** (la URL interna solo funciona en la misma región). |
| `self signed certificate` / `SSL ... certificate` | El cliente `pg` exige verificar el certificado. En conexión interna Render usa autofirmados: añadan `?sslmode=require` o `ssl: { rejectUnauthorized: false }` en la config de `pg`. |
| `password authentication failed` | Usuario/contraseña incorrectos: copiaron la cadena a medias, o la base se recreó y la URL cambió. |
| `relation "usuarios" does not exist` | **Las migraciones no se corrieron.** Vuelvan al paso 7. |
| `secretOrPrivateKey must have a value` | Falta `JWT_SECRET`. |
| `Health check failed` / deploys que fallan sin error de app | El `healthCheckPath` apunta a una ruta que no existe (404). Corríjanla o quítenla del `render.yaml`. |
| `database ... is expired` o conexiones que dejan de funcionar de golpe tras semanas | **La base gratuita expiró.** Vuelvan a la advertencia del principio. |

### El front carga pero no habla con la API

Esto se depura en el **navegador**, no en Render: **F12**.

- **Console**: `blocked by CORS policy` → `CORS_ORIGIN` incorrecto en la API.
- **Network**: la petición va a `localhost:3000` → no actualizaron la URL
  base del front (paso 9).
- **Network**: petición a `http://` desde una página `https://` → *mixed
  content*. La URL de la API debe ir con `https://`.
- Error `401` en todo → el token JWT no se está enviando en el header
  `Authorization: Bearer <token>`.
- La primera petición tarda ~1 minuto y luego todo va bien → es la
  suspensión por inactividad del plan gratuito, no un error.

### La primera petición del día siempre falla por timeout

El servicio estaba suspendido y tarda ~1 minuto en despertar. Si el front
tiene un timeout corto en `fetch`, súbanlo a 60 segundos o muestren un
mensaje de "despertando el servidor".

---

## Fuentes oficiales consultadas

- Especificación de `render.yaml`: <https://render.com/docs/blueprint-spec>
- Planes gratuitos y sus límites: <https://render.com/docs/free>
- Crear y conectar PostgreSQL: <https://render.com/docs/postgresql-creating-connecting>
- Acceso a shell / SSH y qué planes lo admiten: <https://render.com/docs/ssh>
- Deploys y comando pre-deploy: <https://render.com/docs/deploys>
- Versión de Node: <https://render.com/docs/node-version>
- Redirecciones y rewrites en sitios estáticos: <https://render.com/docs/redirects-rewrites>
- Jobs puntuales: <https://render.com/docs/jobs>
- Regiones: <https://render.com/docs/regions>
