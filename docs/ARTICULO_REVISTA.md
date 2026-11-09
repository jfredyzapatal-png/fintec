# Del requisito al despliegue: desarrollo y verificación de FINTEC, un prototipo de banca digital construido bajo un modelo incremental

**Título en inglés:** From requirement to deployment: development and verification of FINTEC, a digital banking prototype built under an incremental model

**Autores**
Castrillón Galeano, Isabela · Cordero Castillo, Samara · Rodríguez Valderrama, Juan José · Rojas Restrepo, Alison · Zapata López, Jhon Fredy

Correo electrónico: *(pendiente)*
Filiación institucional: Institución Universitaria Politécnico Grancolombiano
No. ORCID: *(pendiente)*
País: Colombia

Recepción: XX.XX.XXXX · Aceptación: XX.XX.XXXX · DOI: XXXXXX

---

## Resumen

**Objetivo.** Documentar el desarrollo completo de FINTEC, un prototipo funcional de banca digital, desde el levantamiento de requisitos con el cliente hasta su despliegue y verificación, y evaluar qué prácticas de ingeniería resultaron determinantes para la calidad del producto obtenido.

**Métodos y materiales.** El proyecto se condujo bajo un modelo incremental, seleccionado tras comparar tres modelos de proceso frente a la flexibilidad ante cambios y el tiempo disponible. Los requisitos se levantaron mediante entrevista con el cliente y se formalizaron en ocho requisitos funcionales, cuatro no funcionales, siete reglas de negocio y cuatro escenarios de comportamiento con sus excepciones. La construcción avanzó en tres incrementos: prototipo de interfaz, servicio con persistencia y despliegue. La verificación empleó 52 casos de caja negra derivados de la especificación, ejecutados en dos baterías automatizadas y validados mediante prueba de mutación.

**Resultados.** Se obtuvo una aplicación de tres capas en operación, con tres perfiles de usuario, transferencias, pagos, bolsillos de ahorro, topes configurables, módulo de crédito con amortización francesa y paneles administrativo y contable. Se ejecutaron 134 pruebas con 134 aprobadas y cobertura de 90,09 % de sentencias. Se identificaron y corrigieron 15 defectos: uno crítico, cuatro altos, siete medios y tres bajos.

**Conclusiones.** La trazabilidad explícita entre requisito, caso y resultado detectó un requisito enunciado y nunca implementado, invisible para una revisión guiada por el código. La validación de la batería mediante mutación resultó la decisión de mayor rendimiento del proceso.

**Palabras clave:** ingeniería de requisitos, desarrollo incremental, aseguramiento de calidad, prueba de mutación, arquitectura de tres capas

---

## INTRODUCCIÓN

La formación en ingeniería de software enfrenta una tensión conocida: los cursos introductorios suelen alcanzar a construir un artefacto que funciona en una demostración, pero rara vez a someterlo al ciclo completo que distingue a un producto de software de un ejercicio de programación. Sommerville (2016) sitúa precisamente en ese recorrido —especificación, diseño, implementación, validación y evolución— lo que define a la disciplina frente a la mera codificación.

El presente artículo documenta ese recorrido completo en FINTEC, un prototipo funcional de banca digital desarrollado durante un semestre por un equipo de cinco estudiantes en el curso Ingeniería de Software 1 del Politécnico Grancolombiano. El sistema contempla tres perfiles de usuario —cliente, administrador y contable—, transferencias entre cuentas, pagos a convenios, bolsillos de ahorro, topes de transacción configurables, un módulo de crédito y paneles de gestión administrativa y contable.

### Antecedentes y pertinencia

El dominio elegido no es neutro. Un sistema que maneja dinero impone restricciones que un sistema de información ordinario no tiene: un saldo no puede quedar negativo, una operación rechazada debe registrar su motivo, dos operaciones simultáneas no pueden duplicar un retiro. Estas condiciones hacen del dominio financiero un caso particularmente fértil para ejercitar la especificación de reglas de negocio y su verificación posterior, porque el incumplimiento de cualquiera de ellas produce un error observable y no una simple inconsistencia estética.

A ello se suma un contexto local: la banca digital colombiana ha popularizado la figura de la billetera electrónica, y con ella un conjunto de expectativas de usuario —inmediatez, notificación de cada movimiento, separación del ahorro en bolsillos— que el equipo pudo contrastar directamente con el cliente durante el levantamiento.

### Problema y objetivos

El problema que organiza el trabajo puede enunciarse como sigue: ¿cómo conducir un proyecto de software desde la necesidad expresada por un cliente hasta un producto desplegado y verificado, de modo que cada decisión quede trazada hasta el requisito que la origina y cada afirmación sobre su calidad quede respaldada por evidencia de ejecución?

De este problema se derivan cuatro objetivos. Primero, levantar y especificar los requisitos de manera que resulten verificables, es decir, que admitan criterios de aceptación objetivos. Segundo, seleccionar y justificar un modelo de proceso adecuado al tiempo y la experiencia disponibles. Tercero, construir el producto en incrementos que entreguen funcionalidad utilizable. Cuarto, verificar el producto con casos derivados de la especificación y no de su comportamiento observado.

Queda fuera del alcance la puesta en producción real del sistema con usuarios y dinero efectivos, así como el cumplimiento de la normativa financiera aplicable a una entidad vigilada.

---

## MÉTODO

### Enfoque metodológico

El equipo comparó tres modelos de proceso —cascada, incremental y espiral— frente a cuatro criterios: flexibilidad ante cambios, forma de entrega al cliente, complejidad de gestión y adecuación al tiempo disponible en el semestre. Se seleccionó el **modelo incremental**. La cascada se descartó porque el retorno del cliente llegaría demasiado tarde para corregir; la espiral, porque exige un análisis formal de riesgos en cada ciclo que excedía la experiencia del equipo.

El sistema se dividió en incrementos verificables: registro y autenticación; gestión de cuenta, bolsillos y transferencias; módulo administrativo y contable; y, finalmente, notificaciones y reportes. Se definió además un procedimiento de control de cambios: toda solicitud posterior al cierre de un incremento se documenta por escrito con su impacto estimado, se evalúa y, de aprobarse, se programa para el incremento siguiente actualizando la matriz de trazabilidad.

### Levantamiento y especificación de requisitos

La fuente primaria fue una entrevista semiestructurada con el representante del cliente. Su análisis produjo ocho requisitos funcionales, cuatro no funcionales, siete reglas de negocio y cuatro escenarios de comportamiento, cada uno con entrada, resultado esperado y al menos una excepción.

Dos decisiones metodológicas merecen mención. La primera: los requisitos no funcionales se reescribieron para hacerlos medibles. «El sistema debe ser seguro» no es verificable; «la sesión finaliza automáticamente tras diez minutos sin interacción» y «la cuenta se bloquea quince minutos después de cinco intentos fallidos consecutivos» sí lo son. La segunda: se elaboró una matriz que enlaza cada necesidad expresada en la entrevista con el requisito que la formaliza, el escenario que la ilustra y el diagrama que la representa. Esa matriz reveló que tres necesidades manifestadas por el cliente —notificaciones, reportes descargables y un panel contable detallado— no habían sido trasladadas a requisito alguno en la primera versión del documento, y obligó a incorporarlas.

### Diseño y construcción

La arquitectura resultante es de tres capas: un front-end estático, un servicio HTTP y una base de datos relacional. El modelo de datos quedó en cinco tablas —usuarios, bolsillos, movimientos, alertas y créditos—, con restricciones declarativas que hacen cumplir las reglas de negocio en el motor y no solo en el código. El saldo no negativo, la obligatoriedad del motivo en toda operación rechazada y la unicidad de la reversión por movimiento se expresaron como restricciones `CHECK` e índices parciales.

La construcción avanzó en tres versiones. La primera fue un prototipo de interfaz autocontenido, con toda la lógica en memoria, que permitió validar flujos y pantallas con el cliente antes de invertir en infraestructura. La segunda trasladó las reglas de negocio a un servicio con persistencia real. La tercera incorporó el módulo de crédito con amortización francesa y tres líneas de producto.

Tres decisiones técnicas resultaron relevantes para la calidad y conviene explicitarlas. Las operaciones que mueven dinero se ejecutan dentro de transacciones de base de datos con bloqueo explícito de las filas implicadas, tomando los bloqueos siempre en el mismo orden para evitar interbloqueos. Las contraseñas se almacenan mediante función de derivación con factor de costo, cumpliendo el requisito no funcional correspondiente que el prototipo inicial no podía satisfacer. Y la autorización se resolvió por rol en cada ruta, no solo en la navegación de la interfaz.

### Estrategia de verificación

El criterio rector fue que **el resultado esperado de cada caso proviene de la especificación, nunca del comportamiento observado del producto**. Un caso cuyo resultado esperado se copia de lo que el código ya hace confirma el comportamiento existente, incluidos sus errores.

Se priorizaron cinco atributos de calidad según ISO/IEC 25010 (2023), con prioridad crítica para seguridad y fiabilidad, media para usabilidad y portabilidad, y baja para mantenibilidad. La priorización reconoce una tensión deliberada: cuando seguridad y usabilidad entran en conflicto se privilegió la primera. El mensaje genérico «usuario o contraseña incorrectos» es menos informativo para el usuario legítimo, pero tampoco informa al atacante sobre cuál de los dos datos acertó.

Se diseñaron 52 casos de caja negra incorporando cuatro clases de entrada: válida, inválida, faltante y en el límite de lo permitido. Cada caso registra identificador, requisito verificado, precondiciones, entrada, pasos, resultado esperado, escenario de origen y resultado de la revisión por pares, conforme a la estructura de documentación de pruebas de ISO/IEC/IEEE 29119-3 (2021).

La ejecución se organizó en dos baterías automatizadas sobre el mismo sistema: una sobre la lógica del prototipo y otra sobre las reglas del servicio y su autorización por rol. Para garantizar que las pruebas corrieran contra el artefacto entregado y no contra una copia divergente, se implementó un extractor que lee el archivo del producto en cada ejecución y carga su lógica en un entorno emulado construido a partir del mismo archivo. No existe, por construcción, copia paralela que pueda desincronizarse.

### Validación de la propia batería

Para comprobar que la batería verifica y no solo acompaña, se definieron tres mutaciones sobre ramas de decisión críticas: anulación del control de saldo insuficiente, anulación del bloqueo por intentos fallidos y neutralización de la marca que impide revertir dos veces un mismo movimiento. Cada mutación se aplica sin modificar el producto entregado, y se verifica que la batería falle y que lo haga en el caso correcto (Jia y Harman, 2011).

---

## RESULTADOS

### Producto obtenido

El sistema quedó en operación sobre una infraestructura de tres capas desplegada en la nube. Ofrece tres perfiles diferenciados. El cliente administra su cuenta, transfiere a otras cuentas con confirmación previa del titular destino, paga convenios, organiza su ahorro en bolsillos, configura sus propios topes diario y mensual, consulta movimientos y alertas, descarga reportes y solicita créditos. El administrador busca cuentas por documento, cuenta, correo o nombre, las bloquea o desbloquea, consulta el historial global con filtros y ejecuta devoluciones y cancelaciones de movimientos. El contable accede en modo solo lectura a un panel de flujo financiero filtrable por periodo, con desglose por tipo de transacción.

El módulo de crédito implementa amortización francesa sobre tres líneas con tasas diferenciadas, con operaciones de solicitud y desembolso, pago de cuota y pago total.

### Resultados de verificación

Los 52 casos diseñados se distribuyen en 23 con datos válidos, 22 con datos inválidos, 6 en valores límite y 1 con datos faltantes. Cerca de la mitad del conjunto ejercita condiciones de excepción, proporción buscada deliberadamente.

Su ejecución produjo **134 pruebas automatizadas con 134 aprobadas y ningún fallo**. La diferencia entre casos y pruebas obedece a que varios casos se desdoblaron para aislar cada condición verificada y a que las reglas de negocio se comprueban en los dos niveles. La cobertura alcanzada sobre la lógica de dominio fue de 90,09 % de sentencias, 82,19 % de ramas y 84,21 % de funciones.

### Defectos

Se identificaron y corrigieron **15 defectos**: uno de severidad crítica, cuatro alta, siete media y tres baja. La totalidad fue corregida y verificada mediante nueva ejecución de los casos afectados.

El defecto crítico consistió en que un usuario autenticado podía alcanzar el panel administrativo invocando la navegación desde la consola del navegador: el sistema autenticaba pero no autorizaba. Entre los de severidad alta figuran un bloqueo por intentos fallidos implementado como variable global, que al activarse impedía el ingreso de todas las cuentas y no solo de la que había fallado, y la ausencia de verificación del estado de la cuenta en operaciones posteriores al inicio de sesión, que permitía a un usuario recién bloqueado continuar transaccionando.

Un hallazgo merece comentario aparte por su origen. El requisito funcional de gestión de transacciones se titula «gestión de transacciones y límites», pero ningún límite estaba implementado: no existía tope por operación, diario ni mensual. El defecto era indetectable leyendo el código, porque el código era internamente coherente; solo se hizo visible al contrastar la implementación contra el enunciado del requisito.

### Validación de la batería

Las tres mutaciones fueron detectadas, cada una por el caso que la vigilaba y sin provocar fallos adicionales, lo que indica que los casos están acotados a la condición que declaran verificar.

| Mutación | Rama intervenida | Caso que falla |
|---|---|---|
| M-01 | Control de saldo insuficiente | CP-03 |
| M-02 | Bloqueo por intentos fallidos | CP-14 |
| M-03 | Marca de movimiento revertido | CP-24 |

### Verificación sobre el sistema desplegado

Una prueba de concurrencia sometió el sistema a dos solicitudes simultáneas de transferencia por el saldo completo de una misma cuenta. Una se completó y la otra quedó rechazada con su motivo registrado; el total del sistema permaneció invariable y ninguna cuenta quedó en saldo negativo. El resultado verifica la regla de saldo no negativo en una condición que la ejecución secuencial no alcanza a poner a prueba.

La verificación sobre el servicio en operación ejecutó diez comprobaciones sin fallos, incluyendo la respuesta de los recursos protegidos ante peticiones sin credenciales.

### Trazabilidad

La matriz final enlaza quince agrupaciones de requisitos con sus casos, sus defectos asociados y su resultado de ejecución. Todos los requisitos funcionales y las reglas de negocio verificables quedaron cubiertos por al menos un caso, y todo caso rastrea hasta un requisito.

---

## DISCUSIÓN Y CONCLUSIÓN

El resultado más informativo del proyecto no es que la ejecución final no arroje fallos, sino el trayecto que condujo hasta ahí. Que las 134 pruebas estén en verde solo adquiere significado porque la prueba de mutación demostró antes que esas mismas pruebas son capaces de fallar. Sin esa comprobación, una batería íntegramente verde es un dato ambiguo: puede indicar un producto correcto o una batería que no verifica nada. Jia y Harman (2011) caracterizan la mutación precisamente como un criterio para evaluar la adecuación de un conjunto de pruebas, y en este trabajo resultó la decisión metodológica de mayor rendimiento en relación con su costo.

La segunda observación atraviesa todo el ciclo y conecta el levantamiento con la verificación. La matriz de trazabilidad detectó, en la etapa de especificación, tres necesidades del cliente que no se habían convertido en requisito; y en la etapa de verificación, un requisito que existía en el documento pero no en el producto. Ambos hallazgos tienen la misma raíz: sin un enlace explícito entre lo que el cliente pidió, lo que el documento exige y lo que el código hace, los vacíos no se manifiestan como errores sino como ausencias, y las ausencias no fallan en ninguna prueba que no las busque. La trazabilidad no es, entonces, un requisito burocrático de documentación: es el único mecanismo que hace visible aquello que no está.

Una tercera observación surgió al verificar el sistema desplegado. Dos comprobaciones fallaron inicialmente y, al examinarlas, el defecto no estaba en el producto sino en el instrumento de medición: el script de verificación enviaba las credenciales con nombres de campo ajenos al contrato de la interfaz y esperaba un código de respuesta incorrecto para un recurso restringido por rol. Ambos se registraron como defectos, clasificados como propios de la herramienta. La distinción importa porque un caso que falla no prueba un defecto del producto mientras no se haya descartado que el defecto esté en el caso.

Sobre el modelo de proceso, el carácter incremental permitió validar los flujos con el cliente sobre un prototipo de interfaz antes de invertir en infraestructura, y esa validación temprana evitó construir persistencia para pantallas que habrían cambiado. El costo fue una duplicación transitoria de la lógica entre el prototipo y el servicio, que se mitigó haciendo que las pruebas extrajeran la lógica del propio producto en lugar de mantener una copia.

### Limitaciones

Tres limitaciones deben declararse. La verificación de portabilidad se realizó sobre un único motor de navegador, de modo que el requisito de compatibilidad con tres navegadores permanece parcialmente verificado. El requisito de almacenamiento seguro de contraseñas no se cumple en el prototipo de archivo único, que carece de servidor, y solo se satisface en el servicio construido posteriormente. Y la prueba de aceptación formal con el cliente quedó planificada pero no ejecutada al momento de redactar este informe.

### Conclusiones

Cuatro conclusiones se desprenden del trabajo. Primera: hacer medibles los requisitos no funcionales en la etapa de especificación es lo que permite verificarlos después; un atributo enunciado como adjetivo no admite prueba. Segunda: la derivación de casos a partir de la especificación detectó un requisito enunciado y nunca implementado que ningún procedimiento guiado por el código habría expuesto. Tercera: la validación de la batería mediante mutación es una inversión de bajo costo y alto rendimiento, y debería considerarse parte ordinaria de un plan de pruebas y no un refinamiento opcional. Cuarta: expresar las reglas de negocio como restricciones del motor de base de datos, y no solo como validaciones en el código, traslada su cumplimiento a una capa que ninguna ruta de ejecución puede eludir.

Para quien aborde un proyecto formativo similar se recomienda fijar desde el inicio que el resultado esperado proviene de la especificación; construir la matriz de trazabilidad durante el levantamiento y no al final, cuando ya solo sirve para documentar; e incorporar al menos tres mutaciones antes de dar por buena una batería en verde, porque una prueba que nunca ha fallado todavía no ha demostrado ser capaz de hacerlo.

Como líneas de continuidad se proponen la verificación de portabilidad sobre los tres navegadores exigidos, la ejecución formal de la prueba de aceptación con el cliente y la extensión de la prueba de concurrencia a las operaciones de pago, de movimiento entre bolsillos y de crédito.

---

## REFERENCIAS BIBLIOGRÁFICAS

International Organization for Standardization. (2021). *ISO/IEC/IEEE 29119-3:2021 — Software and systems engineering: Software testing: Part 3: Test documentation*. ISO.

International Organization for Standardization. (2023). *ISO/IEC 25010:2023 — Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE): Product quality model*. ISO.

Jia, Y., & Harman, M. (2011). An analysis and survey of the development of mutation testing. *IEEE Transactions on Software Engineering, 37*(5), 649–678. https://doi.org/10.1109/TSE.2010.62

Myers, G. J., Sandler, C., & Badgett, T. (2012). *The art of software testing* (3rd ed.). Wiley.

Object Management Group. (2017). *OMG Unified Modeling Language (UML), version 2.5.1*. OMG.

Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.
