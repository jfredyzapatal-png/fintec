# Checklist de despliegue — FINTEC en Render

Marquen cada casilla. Lo que esté sin marcar es lo que va a fallar el día de
la sustentación.

**Fecha del despliegue:** `____ / ____ / ________`
**Responsable:** `__________________________`

---

## 🔴 Datos que hay que anotar YA (sin esto no se puede recuperar nada)

| Dato | Valor |
|---|---|
| Fecha de creación de la base de datos | `____ / ____ / ________` |
| **Fecha de expiración de la base (creación + 30 días)** | `____ / ____ / ________` |
| Fecha límite real de borrado (expiración + 14 días de gracia) | `____ / ____ / ________` |
| Región elegida (debe ser la misma para API y base) | `________________` |
| URL del Web Service (API) | `https://__________________.onrender.com` |
| URL del Static Site (front) | `https://__________________.onrender.com` |
| Cuenta de Render usada (correo) | `__________________________` |
| ¿Dónde está guardada la External Database URL? | `__________________________` |

- [ ] La fecha de expiración está apuntada **también** en el grupo del equipo
      y en el calendario de al menos dos personas
- [ ] Leímos la advertencia sobre la expiración de la base en
      `GUIA_DESPLIEGUE.md`

---

## ANTES DEL DESPLIEGUE

### Repositorio

- [ ] El código está en GitHub, rama `main` actualizada
- [ ] Existen las carpetas `api/` y `web/` con la estructura esperada
- [ ] `render.yaml` está en la **raíz** del repositorio (copiado desde
      `deploy/`), o sabemos que hay que indicar la ruta `deploy/render.yaml`
      al crear el Blueprint
- [ ] `api/package.json` tiene los scripts `start`, `migrate` y `seed`
- [ ] `api/package-lock.json` está commiteado (lo exige `npm ci`)
- [ ] `api/.env` **no** está en el repositorio y `.env` está en `.gitignore`
- [ ] No hay secretos, contraseñas ni cadenas de conexión reales commiteados
- [ ] `api/.env.example` documenta `DATABASE_URL`, `JWT_SECRET` y `PORT`

### Código de la API

- [ ] El servidor usa `process.env.PORT` (no un puerto fijo)
- [ ] El servidor escucha en `0.0.0.0`, no en `localhost` ni `127.0.0.1`
- [ ] La conexión `pg` lee `process.env.DATABASE_URL`
- [ ] La conexión `pg` tolera el TLS de Render
      (`?sslmode=require` o `ssl: { rejectUnauthorized: false }`)
- [ ] Existe un endpoint de salud sin autenticación
      (p. ej. `GET /api/health` → 200). Si no existe, el `healthCheckPath`
      del `render.yaml` está comentado
- [ ] CORS está configurado y lee `process.env.CORS_ORIGIN`
- [ ] `JWT_SECRET` se lee del entorno y **no** tiene un valor por defecto
      insegura en el código
- [ ] Todas las dependencias de ejecución están en `dependencies`, no en
      `devDependencies`
- [ ] Si usan `bcrypt`, compila en Node 24; si da problemas, se cambió a
      `bcryptjs`

### Código del front

- [ ] `web/index.html` existe y es la página de entrada
- [ ] La URL base de la API está en un único sitio, fácil de cambiar
- [ ] La URL base distingue entre local y producción (ver paso 9 de la guía)
- [ ] Todas las llamadas usan `https://`, ninguna `http://`
- [ ] El token JWT se envía como `Authorization: Bearer <token>`
- [ ] Hay algún indicador de carga: la primera petición puede tardar ~1 min

### Pruebas en local antes de subir

- [ ] `npm run migrate` funciona contra una base local
- [ ] `npm run seed` funciona y crea el usuario de prueba
- [ ] `npm start` levanta la API y responde el health check
- [ ] El login local devuelve un token
- [ ] `verificar.sh` / `verificar.ps1` pasa contra `http://localhost:PORT`
- [ ] Están anotadas las credenciales del usuario de prueba que crea el seed:
      usuario `________________` / contraseña `________________`

---

## DURANTE EL DESPLIEGUE

### Cuenta y repositorio

- [ ] Cuenta de Render creada (una sola para todo el equipo)
- [ ] GitHub conectado y el repositorio de FINTEC visible en Render
- [ ] Si el repo está en una organización, un admin aprobó la GitHub App

### Base de datos

- [ ] Base PostgreSQL creada, plan **Free**
- [ ] Estado **Available**
- [ ] Región anotada en la tabla de arriba
- [ ] **External Database URL** copiada y guardada en sitio seguro
      (no en el repositorio)
- [ ] Comprobado con `psql "<EXTERNAL_URL>" -c "select 1"` que se conecta

### API (Web Service)

- [ ] Servicio creado (vía Blueprint o manual)
- [ ] **Misma región** que la base de datos
- [ ] Root Directory = `api`
- [ ] Build Command y Start Command correctos
- [ ] Instance Type = **Free**
- [ ] Variables de entorno puestas: `DATABASE_URL`, `JWT_SECRET`, `PORT`,
      `NODE_ENV`, `NODE_VERSION`, `CORS_ORIGIN`
- [ ] `JWT_SECRET` es un valor aleatorio real, no una palabra de ejemplo
- [ ] El build terminó sin errores
- [ ] Estado **Live** (verde)
- [ ] URL de la API anotada arriba

### Migraciones

- [ ] `npm run migrate` ejecutado contra la base de Render
- [ ] `npm run seed` ejecutado contra la base de Render
- [ ] Verificado con `psql "<EXTERNAL_URL>" -c "\dt"` que las tablas existen
- [ ] Verificado que hay datos: `select count(*) from <tabla principal>;`
- [ ] Si se abrió la IP Allow List, **se volvió a cerrar**
- [ ] Si se metió `migrate`/`seed` en el Build Command, **se quitó después**

### Front (Static Site)

- [ ] Static Site creado
- [ ] Root Directory = `web`, Publish Directory = `.`
- [ ] Deploy en estado **Live**
- [ ] URL del front anotada arriba
- [ ] La URL de la API en el código del front apunta a la URL real de Render
- [ ] `CORS_ORIGIN` de la API actualizado con la URL del front
      (**sin barra final**)
- [ ] La API se re-desplegó después de cambiar `CORS_ORIGIN`

---

## DESPUÉS DEL DESPLIEGUE — verificación funcional

### Automática

- [ ] `verificar.sh` / `verificar.ps1` ejecutado contra la URL de producción
- [ ] `POST /api/auth/login` responde (y devuelve token con credenciales
      válidas)
- [ ] `GET /api/cuenta/me` responde 200 con token y 401 sin token
- [ ] `GET /api/movimientos` responde 200 con token
- [ ] `GET /api/contable/resumen` responde 200 con token

### Manual, en el navegador

- [ ] El front carga sin errores en la consola (F12)
- [ ] Login con el usuario del seed funciona
- [ ] Login con contraseña incorrecta devuelve un error claro, no un 500
- [ ] Se ven los datos de la cuenta
- [ ] Se ve el listado de movimientos
- [ ] Se ve el resumen contable
- [ ] Cerrar sesión funciona y deja de dar acceso
- [ ] Probado en Chrome y en otro navegador
- [ ] Probado desde un móvil o con la vista responsive
- [ ] Probado desde la red de la universidad (no solo desde casa)

### Seguridad mínima

- [ ] Sin token, los endpoints protegidos devuelven 401, no datos
- [ ] Las contraseñas están hasheadas en la base
      (`select * from usuarios limit 1;` no muestra texto plano)
- [ ] La API no devuelve stack traces al cliente (`NODE_ENV=production`)
- [ ] No hay credenciales en el JavaScript del front
- [ ] No hay secretos nuevos commiteados después del despliegue

---

## EL DÍA DE LA SUSTENTACIÓN

- [ ] **Comprobado que la base de datos NO ha expirado** (revisar la fecha
      anotada arriba)
- [ ] Dump de respaldo hecho y guardado: `fintec_backup_______.sql`
- [ ] **El front y la API abiertos 3 minutos antes** para que el servicio
      salga de la suspensión por inactividad
- [ ] `verificar.sh` ejecutado esa misma mañana, todo en verde
- [ ] Credenciales del usuario demo a mano y probadas ese día
- [ ] Capturas de pantalla o vídeo de respaldo, por si falla la red
- [ ] Alternativa local preparada (`npm start` + base local) por si Render
      está caído
- [ ] URLs anotadas en papel o en el móvil, no solo en el portátil

---

## MANTENIMIENTO (para que el trabajo siga vivo)

- [ ] Recordatorio en el calendario **5 días antes** de que expire la base
- [ ] Decidido qué se hace al expirar: recrear + re-seed, pasar a plan de
      pago, o aceptar que quede fuera de línea
- [ ] Dump actualizado guardado fuera de Render (Drive, repo privado, etc.)
- [ ] Al menos dos personas del equipo tienen acceso a la cuenta de Render
