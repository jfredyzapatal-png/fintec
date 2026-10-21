/* Genera FINTEC_Plan_de_calidad_y_pruebas.docx */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageBreak
} = require('docx');
const D = require('./data');

const FONT = 'Calibri';
const SZ_BODY = 22;      // 11pt
const SZ_SMALL = 20;     // 10pt
const SZ_H1 = 36;        // 18pt
const SZ_H2 = 30;        // 15pt
const SZ_H3 = 26;        // 13pt
const BLUE = '1757D8';
const NAVY = '0B1E46';
const GREY = '5C6B8C';
const LIGHT = 'F3F7FC';

function run(text, opts) {
  opts = opts || {};
  return new TextRun({
    text: text == null ? '' : String(text),
    font: FONT,
    size: opts.size || SZ_BODY,
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || '10213F'
  });
}

function p(text, opts) {
  opts = opts || {};
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: opts.after != null ? opts.after : 120 },
    children: Array.isArray(text) ? text : [run(text, opts)]
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160, line: 360 },
    children: [new TextRun({ text, font: FONT, size: SZ_H1, bold: true, color: NAVY })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120, line: 360 },
    children: [new TextRun({ text, font: FONT, size: SZ_H2, bold: true, color: NAVY })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100, line: 360 },
    children: [new TextRun({ text, font: FONT, size: SZ_H3, bold: true, color: BLUE })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bul', level: 0 },
    spacing: { after: 80, line: 320 },
    children: [run(text)]
  });
}

function cell(text, opts) {
  opts = opts || {};
  const paragraph = new Paragraph({
    spacing: { line: 300, after: 60 },
    alignment: opts.alignment || AlignmentType.LEFT,
    children: [new TextRun({
      text: text == null ? '' : String(text),
      font: FONT,
      size: opts.size || SZ_SMALL,
      bold: !!opts.bold,
      color: opts.color || '10213F'
    })]
  });
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shading ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shading } : undefined,
    children: [paragraph]
  });
}

/* Construye una tabla con columnas de ancho dado (DXA) */
function table(headers, rows, widths) {
  const header = new TableRow({
    tableHeader: true,
    children: headers.map((t, i) => cell(t, { width: widths[i], bold: true, color: 'FFFFFF', shading: NAVY }))
  });
  const body = rows.map((row, idx) => new TableRow({
    children: row.map((val, i) => cell(val, {
      width: widths[i],
      shading: idx % 2 === 0 ? 'FFFFFF' : LIGHT
    }))
  }));
  return new Table({
    width: { size: widths.reduce((s, w) => s + w, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [header, ...body]
  });
}

/* ===================== Documento ===================== */
const children = [];

/* ---------- Portada ---------- */
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2400, after: 240 },
  children: [new TextRun({ text: 'PLAN DE CALIDAD Y PRUEBAS DEL PRODUCTO', font: FONT, size: 44, bold: true, color: NAVY })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 1200 },
  children: [new TextRun({ text: 'FINTEC — Prototipo de banca digital', font: FONT, size: 32, color: BLUE })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [run('Isabela Castrillón Galeano · Samara Cordero Castillo', { size: SZ_BODY })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [run('Alison Rojas Restrepo · Jhon Fredy Zapata López · Juan José Rodríguez Valderrama', { size: SZ_BODY })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { before: 400, after: 120 },
  children: [run('Institución Universitaria Politécnico Grancolombiano', { size: SZ_BODY, bold: true })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [run('Ingeniería de Software 1 · Docente: Elizabeth Gómez Yepes', { size: SZ_BODY })]
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 120 },
  children: [run('2026', { size: SZ_BODY })]
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

/* ---------- Tabla de contenido manual ---------- */
children.push(h1('Contenido'));
['1. Atributos de calidad priorizados',
 '2. Plan de aseguramiento de calidad (SQA)',
 '3. Estrategia de pruebas',
 '4. Casos de prueba y su revisión',
 '5. Evidencia de ejecución',
 '6. Reporte de defectos',
 '7. Matriz de trazabilidad',
 '8. Acta de prueba de aceptación',
 '9. Registro de uso de IA',
 '10. Material de consulta (APA)'
].forEach(t => children.push(p(t)));
children.push(new Paragraph({ children: [new PageBreak()] }));

/* ---------- 1. Atributos ---------- */
children.push(h1('1. Atributos de calidad priorizados'));
children.push(p('Se seleccionan los atributos de calidad de ISO/IEC 25010:2023 más relevantes para un prototipo bancario, donde el riesgo mayor está en el manejo del dinero y el control de acceso. Para cada atributo se asigna una métrica verificable mediante los casos de prueba definidos en la sección 4.'));
children.push(p([run('Nota sobre tensiones: ', { bold: true }),
  run('privilegiamos seguridad y fiabilidad sobre usabilidad cuando entran en conflicto —por ejemplo, el mensaje genérico "usuario o contraseña incorrectos" sacrifica claridad para no revelar cuál dato está mal (RNF-02, Esc. 2 del documento de requisitos).')]));
children.push(table(
  ['Atributo', 'Prioridad', 'Descripción', 'Métrica verificable'],
  D.ATRIBUTOS,
  [1600, 1200, 3800, 2600]
));

/* ---------- 2. SQA ---------- */
children.push(h1('2. Plan de aseguramiento de calidad (SQA)'));
children.push(p('Se aplican revisiones preventivas por etapa del ciclo de vida (metodología incremental, ver documento de requisitos sección 2). La revisión de requisitos ya corrigió 3 vacíos de la primera entrega (RF-06, RF-07, RF-08) y la revisión de código de esta iteración detectó 11 defectos (sección 6).'));
children.push(table(
  ['Etapa', 'Revisión', 'Realizada por', 'Criterio', 'Hallazgos'],
  D.SQA,
  [1300, 2200, 1500, 2200, 2000]
));
children.push(h3('Criterios de aceptación del producto'));
['100 % de los RF implementados y con al menos un caso de prueba.',
 '100 % de las RN cumplidas en los casos de caja negra.',
 '0 defectos abiertos con severidad crítica.',
 'Defectos de severidad alta: a lo sumo 1 abierto, con justificación escrita.',
 'Acta de prueba de aceptación firmada por el cliente FINTEC.'].forEach(t => children.push(bullet(t)));

/* ---------- 3. Estrategia ---------- */
children.push(h1('3. Estrategia de pruebas'));
children.push(p('La estrategia se organiza en cuatro niveles (unitaria, integración, sistema y aceptación) y combina técnicas de caja blanca y caja negra. La prioridad por riesgo pone en primer lugar las operaciones que mueven dinero y el control de acceso, porque un defecto en ellas tiene impacto financiero directo e irreversible.'));
children.push(table(
  ['Nivel', 'Alcance', 'Técnica', 'Marco / herramienta', 'Justificación por riesgo'],
  [
    ['Unitaria', 'Funciones de dominio: transferir, _reversar, entrar, cambiarPassword, aportar, retirar.', 'Caja blanca (cobertura de ramas)', 'Vitest sobre un módulo fintec.core.js extraído del prototipo.',
     'Son las funciones que mueven dinero y gobiernan el acceso; un fallo es defecto crítico.'],
    ['Integración', 'Interacción pantalla → función de dominio → estado del banco en memoria.', 'Caja negra', 'Ejecución manual en Chrome DevTools.',
     'Confirma que lo probado unitariamente también funciona desde la UI.'],
    ['Sistema', 'Flujos completos: registro → login → transferir → recibir → consultar movimientos → exportar.', 'Caja negra, guiada por los escenarios de la especificación.', 'Checklist manual sobre el prototipo servido en localhost.',
     'Es el camino que vivirá el cliente final.'],
    ['Aceptación', '6 flujos prioritarios con el cliente FINTEC.', 'Caja negra ejecutada con el cliente.', 'Acta firmada (sección 8).',
     'Es la condición para dar por cerrado el incremento.']
  ],
  [1400, 2600, 1800, 2000, 1400]
));
children.push(h3('Priorización por riesgo (mayor → menor)'));
children.push(p('Transferencias (RF-04) · Login y bloqueo (RF-02 / RNF-02) · Devolución y cancelación (RF-05) · Cambio de contraseña (RF-06) · Bolsillos (RF-03 / RN-02) · Dashboard contable (RF-08) · Reportes (RF-07).'));

/* ---------- 4. Casos de prueba ---------- */
children.push(h1('4. Casos de prueba y su revisión'));
children.push(p('Los casos siguientes derivan de los 4 escenarios de comportamiento del documento de requisitos (secciones 9) y de los RF/RN. Para cada campo relevante se incluyen casos válidos, inválidos, faltantes y de valores en los extremos de lo permitido. La columna "Revisión" indica si el caso fue aceptado tal cual, ajustado respecto del draft original (y por qué) o descartado.'));
children.push(table(
  ['ID', 'Req', 'Tipo', 'Precondición', 'Entrada', 'Pasos', 'Resultado esperado', 'Escenario', 'Revisión'],
  D.CASOS,
  [600, 900, 900, 1200, 1200, 1400, 2200, 800, 1000]
));

/* ---------- 5. Evidencia ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('5. Evidencia de ejecución'));
children.push(p('La batería se ejecutó sobre el producto con Vitest. Para que las pruebas corran contra el '
  + 'mismo código que se entrega y no contra una copia paralela, la lógica de dominio se extrae de '
  + 'Fintec.html en cada ejecución (tests/extract-core.mjs) y se carga en un DOM real montado con jsdom '
  + 'a partir del propio HTML. La salida completa está en /evidencia/vitest-output.txt.'));

children.push(h3('Condiciones de ejecución'));
[['Fecha de ejecución', D.EJECUCION.fecha],
 ['Entorno', D.EJECUCION.entorno],
 ['Comando', D.EJECUCION.comando],
 ['Casos diseñados', String(D.EJECUCION.disenados)],
 ['Pruebas ejecutadas', String(D.EJECUCION.ejecutados)],
 ['Aprobadas', String(D.EJECUCION.aprobados)],
 ['Fallidas', String(D.EJECUCION.fallidos)]
].forEach(f => children.push(bullet(f[0] + ': ' + f[1])));
children.push(p(D.EJECUCION.nota, { italics: true, size: SZ_SMALL }));

children.push(h3('Resumen de resultados'));
children.push(table(
  ['Métrica', 'Resultado'],
  [['Pruebas ejecutadas', String(D.EJECUCION.ejecutados)],
   ['Aprobadas', String(D.EJECUCION.aprobados) + ' (100 %)'],
   ['Fallidas', String(D.EJECUCION.fallidos)],
   ['Cobertura de sentencias', D.EJECUCION.cobertura.sentencias],
   ['Cobertura de ramas', D.EJECUCION.cobertura.ramas],
   ['Cobertura de funciones', D.EJECUCION.cobertura.funciones]],
  [4500, 4500]
));

children.push(h3('Verificación de que las aserciones pueden fallar (prueba de mutación)'));
children.push(p('Una batería que nunca falla no demuestra nada. Se introdujo a propósito un defecto en '
  + 'tres ramas de decisión críticas del producto y se comprobó que la batería lo detecta, señalando '
  + 'además el caso correcto. Evidencia en /evidencia/mutacion-output.txt.'));
children.push(table(
  ['ID', 'Rama intervenida', 'Mutación aplicada', 'Caso que la detecta', 'Resultado'],
  D.MUTACION,
  [700, 2400, 2900, 1500, 1700]
));

children.push(h3('Artefactos de evidencia'));
['/evidencia/vitest-output.txt — salida completa del runner con los 40 resultados y la tabla de cobertura.',
 '/evidencia/mutacion-output.txt — las tres ejecuciones con mutación y el caso que falla en cada una.',
 '/evidencia/coverage/ — reporte de cobertura generado por v8.',
 '/tests/fintec.test.mjs — código de las pruebas (anexo).',
 '/tests/extract-core.mjs — extractor que garantiza que se prueba el producto entregado.'
].forEach(t => children.push(bullet(t)));

/* ---------- 6. Defectos ---------- */
children.push(h1('6. Reporte de defectos'));
children.push(p('Los siguientes 11 defectos fueron detectados en la revisión de código (SQA, sección 2) contra la especificación de requisitos y los escenarios de comportamiento, y fueron corregidos en la iteración actual. Cada defecto incluye el caso de prueba que lo revelaría, los pasos para reproducirlo y la severidad asignada según su impacto financiero y de seguridad.'));
children.push(table(
  ['ID', 'Caso', 'Descripción', 'Pasos / Esperado vs Obtenido', 'Severidad', 'Estado'],
  D.DEFECTOS,
  [700, 900, 2600, 2800, 1100, 1700]
));
children.push(h3('Análisis por causa raíz'));
['Alcance de variables (D-01, D-05): estado del sistema modelado como global cuando debía ser por entidad; se trasladó a diccionarios por doc.',
 'Validación de entradas (D-02): la especificación pide datos obligatorios y formatos; el prototipo pedía los datos pero no los validaba.',
 'Control de acceso (D-03, D-06, D-11): el prototipo autenticaba pero no autorizaba por rol ni verificaba estado de cuenta en cada acción.',
 'Omisión de requisitos (D-07, D-08, D-09, D-10): correspondían a RF-05 CA-05.1, RF-06 CA-06.2, RF-08 CA-08.1 y RF-04 CA-04.1 que no estaban implementados.',
 'Manejo de estados de UI (D-04): el botón no reflejaba el estado del recurso.'].forEach(t => children.push(bullet(t)));

/* ---------- 7. Trazabilidad ---------- */
children.push(h1('7. Matriz de trazabilidad'));
children.push(p('Vincula cada requisito con los casos de prueba que lo verifican, los defectos relacionados y el estado de la verificación. Esta matriz es la contraparte, en el plano de pruebas, de la matriz requisito ↔ escenario ↔ diagrama que aparece en la especificación de requisitos.'));
children.push(table(
  ['Requisito', 'Caso(s) de prueba', 'Defecto(s)', 'Resultado esperado', 'Estado'],
  D.TRAZABILIDAD,
  [1600, 2800, 1600, 2400, 1600]
));
children.push(p([run('Cobertura: ', { bold: true }),
  run('8 de 8 RF (100 %), 2 de 4 RNF (RNF-01 y RNF-02; RNF-03 y RNF-04 se verifican por inspección en navegadores), 5 de 7 RN con caso dedicado (RN-01, RN-02, RN-04, RN-05, RN-07); RN-03 y RN-06 se verifican como efecto colateral de los casos anteriores.')]));

/* ---------- 8. Acta ---------- */
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('8. Acta de prueba de aceptación'));
children.push(p('La prueba de aceptación se realiza con el representante de FINTEC, ejecutando los 6 flujos de mayor valor para el negocio. El cliente decide si acepta el producto, lo acepta con condiciones o lo rechaza, y lo deja consignado al pie de este documento.'));
children.push(h3('Casos ejecutados en la prueba de aceptación'));
children.push(table(
  ['#', 'Caso', 'Flujo de negocio', 'Resultado'],
  [
    ['1', 'CP-16', 'Alta de nueva cuenta', '☐ Aceptado    ☐ Observado    ☐ Rechazado'],
    ['2', 'CP-09 + CP-14', 'Login y bloqueo tras 5 intentos', '☐ Aceptado    ☐ Observado    ☐ Rechazado'],
    ['3', 'CP-01 + CP-03', 'Transferencia válida y rechazo por saldo', '☐ Aceptado    ☐ Observado    ☐ Rechazado'],
    ['4', 'CP-23', 'Devolución administrativa', '☐ Aceptado    ☐ Observado    ☐ Rechazado'],
    ['5', 'CP-30', 'Cambio de contraseña con notificación', '☐ Aceptado    ☐ Observado    ☐ Rechazado'],
    ['6', 'CP-33 + CP-35', 'Reporte CSV y dashboard contable', '☐ Aceptado    ☐ Observado    ☐ Rechazado']
  ],
  [700, 1200, 4000, 3300]
));
children.push(h3('Datos del cliente'));
children.push(table(
  ['Campo', 'Valor'],
  [
    ['Fecha de la prueba', ''],
    ['Nombre del representante de FINTEC', ''],
    ['Cargo', ''],
    ['Decisión', '☐ Aceptado    ☐ Aceptado con condiciones    ☐ Rechazado'],
    ['Observaciones del cliente', ''],
    ['Firma del representante', ''],
    ['Firma del equipo desarrollador', '']
  ],
  [3200, 6000]
));

/* ---------- 9. Registro de IA ---------- */
children.push(h1('9. Registro de uso de IA'));
children.push(p('El equipo utilizó asistentes de IA para acelerar la revisión del código del prototipo, la derivación de casos de prueba a partir de los escenarios de la especificación y la redacción del presente documento. Todos los casos y resultados reportados fueron verificados por el equipo contra la especificación.'));
children.push(h3('Herramientas y uso'));
children.push(table(
  ['Herramienta', 'Modelo / versión', 'Para qué se usó'],
  [
    ['Cursor (Agent mode)', 'Claude 4.7 (modo thinking)', 'Revisión del código del prototipo, implementación de las correcciones derivadas de los defectos, generación del borrador de casos de prueba a partir de los 4 escenarios de la especificación y redacción del presente documento.'],
    ['OpenSpec (enfoque)', '—', 'Encuadre del formato de escenarios y de casos (Entrada / Resultado esperado / Excepción) para que los resultados esperados vengan de la especificación y no del comportamiento del código.']
  ],
  [2400, 2400, 4400]
));
children.push(h3('Evolución de los prompts principales'));
children.push(table(
  ['v', 'Prompt', 'Cambio respecto de la anterior', 'Motivo'],
  [
    ['1', '"Revisa el archivo"', '—', 'Primer análisis libre del prototipo.'],
    ['2', '"Corrige los problemas detectados"', 'Pide acción tras el diagnóstico.', 'Separar la fase de análisis de la fase de corrección para que los cambios estén justificados.'],
    ['3', '"La idea es no cambiar nada visual"', 'Restricción explícita de alcance.', 'Preservar el diseño ya validado con el cliente y evitar que la refactorización arrastre cambios visuales no acordados.'],
    ['4', '"Revisa qué cumplimos y qué no respecto del documento de calidad"', 'Pide análisis sistemático de gaps.', 'Pasar de corrección puntual a trazabilidad completa contra la rúbrica.'],
    ['5', '"Entrégame un archivo con los casos de prueba y empieza a completar todo lo del documento"', 'Pide materializar el entregable.', 'Convertir el análisis en el documento académico calificable.']
  ],
  [500, 3200, 2600, 2900]
));
children.push(h3('Casos propuestos por la IA que se descartaron o ajustaron'));
['Descartado: caso de "transferencia a cuenta de otro banco". No está en el alcance del RF-04 del prototipo; la especificación cubre solo cuentas FINTEC.',
 'Ajustado: el caso de "cerrar sesión al bloquear" originalmente verificaba solo transferencias. Se amplió a pagos y bolsillos porque RN-07 aplica a toda transacción.',
 'Ajustado: el botón "Devolver" originalmente no reflejaba estado; se le añadió el atributo disabled para que el caso CP-24 se verifique a nivel de UI y no solo de validación.'].forEach(t => children.push(bullet(t)));

/* ---------- 10. Referencias ---------- */
children.push(h1('10. Material de consulta'));
['International Organization for Standardization. (2023). ISO/IEC 25010:2023 — Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE): Product quality model. ISO.',
 'International Organization for Standardization. (2021). ISO/IEC/IEEE 29119-3:2021 — Software and systems engineering: Software testing: Part 3: Test documentation. ISO.',
 'ISO/IEC/IEEE. (2018). ISO/IEC/IEEE 29148:2018 — Systems and software engineering: Life cycle processes: Requirements engineering. IEEE.',
 'Myers, G. J., Sandler, C., & Badgett, T. (2012). The art of software testing (3.ª ed.). Wiley.',
 'Object Management Group. (2017). OMG Unified Modeling Language (UML), Version 2.5.1. OMG.',
 'Sommerville, I. (2011). Ingeniería de software (9.ª ed.). Pearson Educación.'
].forEach(ref => children.push(new Paragraph({
  spacing: { after: 160, line: 320 },
  indent: { left: 720, hanging: 720 },
  children: [run(ref)]
})));

/* ===================== Documento final ===================== */
const doc = new Document({
  creator: 'Equipo FINTEC',
  title: 'Plan de calidad y pruebas - FINTEC',
  styles: { default: { document: { run: { font: FONT, size: SZ_BODY } } } },
  numbering: {
    config: [{
      reference: 'bul',
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } }
      }]
    }]
  },
  sections: [{
    properties: { page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
    children
  }]
});

const outPath = path.join(__dirname, '..', 'docs', 'Plan_de_calidad_y_pruebas.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('OK:', outPath);
});
