# FINTEC — prototipo y plan de calidad

Proyecto académico de Ingeniería de Software 1 (Politécnico Grancolombiano).
Prototipo funcional de una plataforma bancaria web y su plan de calidad y pruebas.

> Maqueta académica. No es una institución financiera real, no hay servidor ni
> base de datos: todo el estado vive en memoria y se reinicia al recargar.

## Estructura

```
fintec/
├─ producto/      el prototipo (un solo archivo HTML autocontenido)
│  ├─ Fintec.html
│  ├─ serve.ps1           servidor estático local (puerto 8765)
│  └─ historial/          versión previa, antes de la lógica de negocio
├─ docs/          entregables
│  ├─ Especificacion_de_Requisitos.docx
│  ├─ Plan_de_calidad_y_pruebas.docx    (generado, no editar a mano)
│  └─ enunciado/
├─ calidad/       batería de pruebas y generador del plan
│  ├─ tests/              pruebas automatizadas (Vitest + jsdom)
│  ├─ evidencia/          salida real de las ejecuciones
│  ├─ data.js             contenido del plan de calidad
│  └─ generate.js         arma el .docx a partir de data.js
└─ herramientas/
```

## Ejecutar el prototipo

La forma más simple es abrir `producto/Fintec.html` con doble clic: es
autocontenido y funciona sobre `file://`.

Para servirlo por HTTP:

```powershell
powershell -ExecutionPolicy Bypass -File producto/serve.ps1
```

Queda en http://localhost:8765/

### Credenciales de demostración

| Usuario | Clave | Rol |
|---|---|---|
| `1023456789` | `maria123` | Usuario — María Gómez |
| `1098765432` | `carlos123` | Usuario — Carlos Ruiz |
| `1076543210` | `laura123` | Usuario — Laura Díaz |
| `1045678901` | `andres123` | Usuario — Andrés Pérez |
| `admin` | `admin123` | Administrador |
| `contable` | `conta123` | Contable |

Las claves están en el código a la vista. Es deliberado: es una maqueta sin
servidor. En un sistema real la validación iría en el backend con la contraseña
hasheada (RNF-02).

Tras 5 intentos fallidos la cuenta queda bloqueada 15 minutos, y la sesión se
cierra sola a los 10 minutos de inactividad. Recargar la página reinicia ambos
contadores y todos los saldos.

## Ejecutar las pruebas

```bash
cd calidad
npm install
npm test            # 40 pruebas
npm run cobertura   # con reporte de cobertura
```

Las pruebas **corren contra el producto entregado**: `tests/extract-core.mjs`
extrae la lógica de dominio de `producto/Fintec.html` en cada ejecución y la
carga en un DOM montado con jsdom desde el mismo HTML. No hay una copia paralela
del código que pueda divergir, y si el prototipo deja de declarar una función
esperada, el extractor falla de inmediato.

### Comprobar que las pruebas pueden fallar

```bash
MUTAR=saldo npm test        # rompe el control de saldo insuficiente  -> falla CP-03
MUTAR=bloqueo npm test      # rompe el bloqueo por intentos          -> falla CP-14
MUTAR=revertida npm test    # rompe la marca de reversión            -> falla CP-24
```

Sin la variable `MUTAR` no se altera nada.

## Regenerar el plan de calidad

```bash
cd calidad
npm run doc     # escribe docs/Plan_de_calidad_y_pruebas.docx
```

El contenido se edita en `calidad/data.js`, nunca en el `.docx`, que se
sobrescribe en cada generación.

## Estado

- Prototipo: 8 requisitos funcionales implementados (RF-04 y RF-07 parciales).
- Pruebas: 40 ejecutadas, 40 aprobadas; 84,09 % de cobertura de ramas.
- Pendiente: acta de aceptación con el cliente y verificación en Firefox y Edge
  (RNF-04).
- Decisiones abiertas del equipo: el choque entre RN-03 y CA-05.2, los estados
  `Pendiente` y `Procesada` que CA-04.1 exige y nadie implementa, y declarar
  RNF-02 (bcrypt) como no verificable en este incremento.
