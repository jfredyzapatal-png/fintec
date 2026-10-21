import fs from 'node:fs';
import { generarCore, RUTA_CORE } from './extract-core.mjs';

/* Mutaciones para comprobar que las aserciones pueden fallar (prueba de
   mutacion). Se activan con MUTAR=<id>; sin la variable no se altera nada.
   Cada una rompe deliberadamente una rama de decision del producto: si la
   bateria sigue en verde con la mutacion aplicada, el caso no estaba
   verificando nada. */
const MUTACIONES = {
  // RN-01: anula el control de saldo insuficiente en transferencias
  'saldo':   [ 'if (monto > u.disponible){', 'if (false){' ],
  // RNF-02: anula el bloqueo por intentos fallidos
  'bloqueo': [ 'if (intentosPorDoc[doc] >= MAX_INTENTOS){', 'if (false){' ],
  // RN-05: hace que la devolucion no marque el movimiento como revertido
  'revertida': [ 'm.revertida = true;', 'm.revertida = false;' ]
};

export default function () {
  generarCore();

  const id = process.env.MUTAR;
  if (!id) return;

  const mut = MUTACIONES[id];
  if (!mut) throw new Error('Mutacion desconocida: ' + id);

  const src = fs.readFileSync(RUTA_CORE, 'utf8');
  if (!src.includes(mut[0])) throw new Error('La mutacion "' + id + '" ya no aplica al producto');
  fs.writeFileSync(RUTA_CORE, src.replace(mut[0], mut[1]), 'utf8');
  console.log('[mutacion] aplicada "' + id + '": ' + mut[0] + '  ->  ' + mut[1]);
}
