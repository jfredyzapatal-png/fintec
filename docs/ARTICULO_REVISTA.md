# Verificación de un prototipo de banca digital mediante pruebas derivadas de la especificación: extracción de la lógica del producto y validación por mutación

**Título en inglés:** Verification of a digital banking prototype through specification-derived testing: product logic extraction and mutation-based validation

**Autores**
Castrillón Galeano, Isabela · Cordero Castillo, Samara · Rodríguez Valderrama, Juan José · Rojas Restrepo, Alison · Zapata López, Jhon Fredy

Correo electrónico: *(pendiente)*
Filiación institucional: Institución Universitaria Politécnico Grancolombiano
No. ORCID: *(pendiente)*
País: Colombia

Recepción: XX.XX.XXXX · Aceptación: XX.XX.XXXX · DOI: XXXXXX

---

## Resumen

**Objetivo.** Evaluar la calidad de FINTEC, un prototipo funcional de banca digital desarrollado en el marco de un curso de ingeniería de software, mediante un plan de aseguramiento y un proceso de pruebas cuyos casos se derivan de la especificación de requisitos y no del comportamiento observado del código.

**Métodos y materiales.** Se priorizaron cinco atributos de calidad según ISO/IEC 25010 y se les asoció una métrica verificable. Se diseñaron 52 casos de prueba de caja negra a partir de los requisitos funcionales, las reglas de negocio y los escenarios de comportamiento de la especificación. La verificación se organizó en dos baterías automatizadas sobre el mismo sistema: una de 51 pruebas sobre el prototipo y otra de 83 sobre las reglas del servicio. Para garantizar que las pruebas se ejecutaran contra el artefacto entregado y no contra una copia divergente, la lógica de dominio se extrae del propio archivo del producto en cada ejecución. La batería se validó mediante tres mutaciones deliberadas sobre ramas de decisión críticas.

**Resultados.** Se ejecutaron 134 pruebas con 134 aprobadas y ningún fallo, con una cobertura de 90,09 % de sentencias, 82,19 % de ramas y 84,21 % de funciones. Se identificaron y corrigieron 15 defectos: uno de severidad crítica, cuatro alta, siete media y tres baja. Las tres mutaciones fueron detectadas por el caso que las vigilaba, y solo por ese. Una prueba de concurrencia sobre la base de datos desplegada confirmó que dos transferencias simultáneas del saldo completo no corrompen el estado del sistema.

**Conclusiones.** Derivar los casos de la especificación reveló defectos que una verificación guiada por el código no habría expuesto, en particular un requisito enunciado pero nunca implementado. La prueba de mutación resultó decisiva para distinguir una batería que verifica de una que solo acompaña.

**Palabras clave:** aseguramiento de calidad, pruebas de software, prueba de mutación, trazabilidad de requisitos, caja negra

---

## INTRODUCCIÓN

Un producto de software que funciona durante una demostración no es, por ese solo hecho, un producto de calidad. Los defectos más costosos rara vez aparecen en el camino feliz: se esconden en las entradas inválidas, en los valores situados en los extremos de lo permitido y en combinaciones de uso que nadie anticipó. La literatura sobre pruebas insiste en este punto desde hace décadas; Myers, Sandler y Badgett (2012) definen la prueba como el proceso de ejecutar un programa con la intención de encontrar errores, y advierten que un caso diseñado para confirmar que el sistema funciona tiene poco valor diagnóstico frente a uno diseñado para hacerlo fallar.

A esa dificultad se suma una segunda, más sutil y menos discutida en los cursos introductorios: el origen del resultado esperado. Cuando el resultado esperado de un caso de prueba se toma de lo que el código ya hace, la prueba deja de verificar y pasa a documentar. Confirma el comportamiento existente, incluidos sus errores, y produce una batería que nunca falla y que por lo tanto nada demuestra. La norma ISO/IEC/IEEE 29119-3 (2021) aborda esta cuestión al exigir que la documentación de pruebas establezca la trazabilidad entre cada caso y el elemento de la especificación que lo origina.

Este artículo presenta la etapa de verificación de FINTEC, un prototipo funcional de banca digital construido bajo una metodología incremental en el curso Ingeniería de Software 1 del Politécnico Grancolombiano. El sistema contempla tres perfiles —usuario, administrador y contable—, transferencias entre cuentas, pagos a convenios, bolsillos de ahorro, topes de transacción configurables, gestión administrativa de movimientos y un panel contable.

El estudio se delimita a la verificación del producto ya construido frente a su especificación de requisitos previamente validada con el cliente. No aborda el levantamiento de requisitos ni el diseño, tratados en etapas anteriores del mismo proyecto. Su relevancia para el equipo es doble: por un lado, obliga a traducir atributos abstractos de calidad en verificaciones concretas y medibles; por otro, somete a prueba una pregunta metodológica que rara vez se formula de manera explícita en el aula, a saber, cómo saber si una batería de pruebas efectivamente verifica algo.

### Problema y objetivos

El problema que aborda el estudio puede enunciarse así: dado un prototipo funcional y una especificación de requisitos, ¿cómo construir un proceso de verificación cuyos resultados constituyan evidencia y no mera confirmación?

De ahí se desprenden tres objetivos. Primero, priorizar los atributos de calidad críticos para un sistema que maneja dinero y asociarles métricas verificables. Segundo, diseñar y ejecutar un conjunto de casos derivados de la especificación que cubra datos válidos, inválidos, faltantes y en los extremos de lo permitido. Tercero, validar la propia batería de pruebas, demostrando que es capaz de detectar un defecto introducido deliberadamente.

---

## MÉTODO

### Enfoque metodológico

El estudio adopta un enfoque de verificación sistemática en cuatro fases consecutivas: priorización de atributos de calidad, diseño de casos a partir de la especificación, ejecución instrumentada y análisis de defectos. El criterio que gobierna todo el proceso es que el resultado esperado de cada caso proviene de la especificación de requisitos, nunca del comportamiento observado del producto.

La priorización de atributos siguió el modelo de calidad de producto de ISO/IEC 25010 (2023), seleccionando aquellos pertinentes para un sistema financiero. Se asignó prioridad crítica a la seguridad y a la fiabilidad, prioridad media a la usabilidad y la portabilidad, y prioridad baja a la mantenibilidad. La decisión reconoce una tensión real: cuando seguridad y usabilidad entran en conflicto, se privilegió la primera. El mensaje genérico «usuario o contraseña incorrectos», por ejemplo, es deliberadamente menos útil para el usuario legítimo porque tampoco informa al atacante sobre cuál de los dos datos acertó.

### Fuentes de datos

Las fuentes fueron tres. La especificación de requisitos del proyecto, que aporta ocho requisitos funcionales, cuatro no funcionales, siete reglas de negocio y cuatro escenarios de comportamiento con sus excepciones. El código del producto, sometido a revisión. Y la salida de las herramientas de prueba, única fuente admitida para los resultados reportados.

### Variables y criterios de verificación

Las variables observadas fueron el estado de cada caso de prueba, la cobertura de código alcanzada, el número de defectos por severidad y la capacidad de detección de la batería. Esta última se operacionalizó mediante prueba de mutación: si al introducir un defecto deliberado en una rama de decisión la batería permanece en verde, el caso que debía vigilarla no verifica nada (Jia y Harman, 2011).

### Procedimiento y herramientas

Se construyeron dos baterías automatizadas sobre el mismo sistema. La primera ejerce la lógica del prototipo mediante Vitest 3.2.4 sobre un DOM emulado con jsdom 26.1.0. La segunda verifica las reglas de negocio y la autorización por rol del servicio mediante el ejecutor nativo de Node.js. Ambas se ejecutan en el entorno del equipo sobre Node v24.11.0.

El diseño de la primera batería resolvió un problema específico. El prototipo es un archivo único que concentra marcado, estilos y lógica, lo que dificulta importarlo desde un marco de pruebas. La alternativa habitual —copiar la lógica a un módulo aparte— introduce el riesgo de que la copia y el producto diverjan silenciosamente, de modo que las pruebas acaben verificando un artefacto que no es el que se entrega. Para evitarlo se implementó un extractor que, en cada ejecución, lee el archivo del producto, extrae su bloque de lógica y lo carga en un DOM construido a partir del mismo archivo. La consecuencia práctica es que no existe copia paralela posible: si el producto deja de declarar una función esperada, el extractor interrumpe la ejecución.

Los casos se diseñaron a partir de cada requisito y cada regla de negocio, incorporando de forma deliberada cuatro clases de entrada: válida, inválida, faltante y en el límite de lo permitido. Cada caso registra identificador, requisito verificado, precondiciones, datos de entrada, pasos, resultado esperado, escenario de origen y el resultado de su revisión por el equipo.

### Validación de la batería

Se definieron tres mutaciones sobre ramas de decisión críticas del producto: la anulación del control de saldo insuficiente, la anulación del bloqueo por intentos fallidos y la neutralización de la marca que impide revertir dos veces un mismo movimiento. Cada mutación se aplica mediante una variable de entorno, sin modificar el producto entregado, y se verifica que la batería falle y que lo haga en el caso correcto.

---

## RESULTADOS

### Ejecución

Se diseñaron 52 casos de prueba distribuidos en 23 con datos válidos, 22 con datos inválidos, 6 en valores límite y 1 con datos faltantes. La proporción es deliberada: cerca de la mitad del conjunto ejercita condiciones de excepción.

Los 52 casos se ejecutaron como 134 pruebas automatizadas —51 en la batería del prototipo y 83 en la del servicio—, con **134 aprobadas y ningún fallo**. La diferencia entre casos y pruebas obedece a dos razones: varios casos se desdoblaron para aislar cada condición verificada, y las reglas de negocio se comprueban en los dos niveles.

La cobertura alcanzada sobre la lógica de dominio fue de 90,09 % de sentencias, 82,19 % de ramas y 84,21 % de funciones, por encima del umbral de 80 % fijado como métrica del atributo de mantenibilidad.

### Defectos

Se identificaron y corrigieron **15 defectos**, distribuidos en una severidad crítica, cuatro altas, siete medias y tres bajas. La totalidad fue corregida y verificada mediante nueva ejecución de los casos afectados.

El defecto crítico consistió en que un usuario autenticado podía alcanzar el panel administrativo invocando la navegación desde la consola del navegador: el sistema autenticaba, pero no autorizaba por rol. Entre los de severidad alta destacan un bloqueo por intentos fallidos implementado como variable global, que al activarse impedía el ingreso de todas las cuentas y no solo de la que había fallado, y la ausencia de verificación del estado de la cuenta en operaciones posteriores al inicio de sesión, que permitía a un usuario recién bloqueado continuar transaccionando.

Un hallazgo merece comentario aparte por su origen. El requisito funcional de gestión de transacciones se titula «gestión de transacciones y límites», pero ningún límite estaba implementado: no existía tope por operación, diario ni mensual. El defecto no era detectable leyendo el código, porque el código era internamente coherente; solo se hizo visible al contrastar la implementación con el enunciado del requisito. Es el argumento empírico más claro a favor de derivar los casos de la especificación.

### Validación de la batería por mutación

Las tres mutaciones fueron detectadas. Cada una provocó exactamente un fallo, y en el caso que la vigilaba:

| Mutación | Rama intervenida | Caso que falla |
|---|---|---|
| M-01 | Control de saldo insuficiente | CP-03 |
| M-02 | Bloqueo por intentos fallidos | CP-14 |
| M-03 | Marca de movimiento revertido | CP-24 |

Que ninguna mutación provocara fallos adicionales indica además que los casos están acotados a la condición que declaran verificar.

### Verificación sobre el sistema desplegado

La prueba de concurrencia sometió el sistema a dos solicitudes simultáneas de transferencia por el saldo completo de una misma cuenta. Una se completó y la otra quedó rechazada con su motivo registrado; el total del sistema se mantuvo invariable y ninguna cuenta quedó en saldo negativo. El resultado verifica la regla de negocio que prohíbe saldos negativos en una condición que la ejecución secuencial no alcanza a poner a prueba.

La verificación sobre el servicio desplegado ejecutó diez comprobaciones sin fallos, incluyendo la respuesta de los endpoints protegidos ante peticiones sin credenciales.

### Trazabilidad

La matriz final enlaza 15 agrupaciones de requisitos con sus casos, sus defectos asociados y su resultado de ejecución. Todos los requisitos funcionales y las reglas de negocio verificables quedaron cubiertos por al menos un caso, y todo caso rastrea hasta un requisito.

---

## DISCUSIÓN Y CONCLUSIÓN

El resultado más informativo del estudio no es la ausencia de fallos en la ejecución final, sino el trayecto que condujo a ella. Que las 134 pruebas estén en verde solo adquiere significado porque la prueba de mutación demostró previamente que esas mismas pruebas son capaces de fallar. Sin esa comprobación, una batería íntegramente verde es un dato ambiguo: puede indicar un producto correcto o una batería que no verifica nada. Esta distinción, señalada por Jia y Harman (2011) al caracterizar la mutación como un criterio para evaluar la adecuación de un conjunto de pruebas, resultó ser la decisión metodológica de mayor rendimiento del trabajo.

La segunda observación se refiere al origen de los casos. El defecto de los límites no implementados ilustra una limitación estructural de la verificación guiada por el código: un conjunto de pruebas derivado del comportamiento observado habría confirmado que las transferencias se procesan correctamente, porque efectivamente lo hacían, y habría pasado por alto que el requisito exigía algo que el sistema no hacía en absoluto. La trazabilidad no es entonces un requisito burocrático de documentación, sino el mecanismo que permite detectar requisitos no implementados.

Una tercera observación surgió al verificar el sistema desplegado. Dos comprobaciones fallaron inicialmente y, al examinarlas, el defecto no estaba en el producto sino en el instrumento: el script de verificación enviaba las credenciales con nombres de campo que no correspondían al contrato de la interfaz, y esperaba un código de respuesta incorrecto para un recurso restringido por rol. Ambos se registraron como defectos, clasificados como propios de la herramienta de prueba. La distinción importa porque un caso que falla no es prueba de un defecto del producto mientras no se haya descartado que el defecto esté en el caso.

### Limitaciones

El estudio presenta tres limitaciones que conviene declarar. La verificación de portabilidad se realizó sobre un único motor de navegador, de modo que el requisito no funcional de compatibilidad con tres navegadores permanece parcialmente verificado. El requisito de almacenamiento de contraseñas mediante función de derivación con factor de costo no se cumple en el prototipo de archivo único, que carece de servidor, y solo se satisface en el servicio construido posteriormente. Finalmente, la prueba de aceptación con el cliente quedó planificada pero no ejecutada al momento de redactar este informe.

### Conclusiones

Tres conclusiones se desprenden del trabajo. Primera: la derivación de casos a partir de la especificación detectó al menos un defecto —un requisito enunciado y nunca implementado— que ningún procedimiento guiado por el código habría expuesto. Segunda: la validación de la batería mediante mutación es una inversión de bajo costo y alto rendimiento, y debería considerarse parte ordinaria de un plan de pruebas y no un refinamiento opcional. Tercera: la decisión de ejecutar las pruebas contra el artefacto entregado, extrayendo su lógica en cada corrida en lugar de mantener una copia, elimina por construcción una clase entera de error silencioso.

Para quien aborde un trabajo similar se recomienda, en consecuencia, fijar desde el inicio la regla de que el resultado esperado proviene de la especificación; incorporar al menos tres mutaciones antes de dar por buena una batería en verde; y desconfiar de toda prueba que nunca haya fallado, porque mientras no falle no ha demostrado ser capaz de hacerlo.

Como líneas de continuidad se proponen la verificación de portabilidad sobre los tres navegadores exigidos, la ejecución formal de la prueba de aceptación con el cliente y la extensión de la prueba de concurrencia a las operaciones de pago y de movimiento entre bolsillos.

---

## REFERENCIAS BIBLIOGRÁFICAS

International Organization for Standardization. (2023). *ISO/IEC 25010:2023 — Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE): Product quality model*. ISO.

International Organization for Standardization. (2021). *ISO/IEC/IEEE 29119-3:2021 — Software and systems engineering: Software testing: Part 3: Test documentation*. ISO.

Jia, Y., & Harman, M. (2011). An analysis and survey of the development of mutation testing. *IEEE Transactions on Software Engineering, 37*(5), 649–678. https://doi.org/10.1109/TSE.2010.62

Myers, G. J., Sandler, C., & Badgett, T. (2012). *The art of software testing* (3rd ed.). Wiley.

Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.
