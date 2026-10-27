/* ============================================================
   npm run seed — datos de demostracion.

   Son EXACTAMENTE los del prototipo (producto/Fintec.html):
   6 clientes, sus cuentas, saldos y bolsillos, mas admin y contable.
   El total del sistema (disponible + bolsillos) es $18.000.000, el
   mismo valor que verifica CP-44.

   RNF-02: ninguna contrasena se guarda en texto plano. Las claves de
   demostracion estan aqui porque son publicas (el prototipo las
   muestra en botones de la pantalla de login) y se insertan
   hasheadas con bcrypt.
   ============================================================ */

import bcrypt from 'bcryptjs';
import { config, verificarConfig } from '../src/config.js';
import { pool, enTransaccion, cerrarPool } from '../src/db.js';

const TOPE_DIARIO = 5000000;
const TOPE_MENSUAL = 20000000;

const CLIENTES = [
  {
    doc: '1023456789', nombre: 'María Gómez', clave: 'maria123', cuenta: '001-234-567',
    disponible: 2450000, tipo: 'CC', correo: 'maria.gomez@correo.com', nacimiento: '1996-04-12',
    bolsillos: [{ nombre: 'Vacaciones', saldo: 800000 }, { nombre: 'Emergencias', saldo: 350000 }],
  },
  {
    doc: '1098765432', nombre: 'Carlos Ruiz', clave: 'carlos123', cuenta: '001-880-112',
    disponible: 1200000, tipo: 'CC', correo: 'carlos.ruiz@correo.com', nacimiento: '1990-11-02',
    bolsillos: [{ nombre: 'Estudio', saldo: 400000 }],
  },
  {
    doc: '1076543210', nombre: 'Laura Díaz', clave: 'laura123', cuenta: '009-441-220',
    disponible: 3800000, tipo: 'CE', correo: 'laura.diaz@correo.com', nacimiento: '1988-07-19',
    bolsillos: [{ nombre: 'Viaje', saldo: 1000000 }],
  },
  {
    doc: '1045678901', nombre: 'Andrés Pérez', clave: 'andres123', cuenta: '008-990-455',
    disponible: 640000, tipo: 'CC', correo: 'andres.perez@correo.com', nacimiento: '1999-02-28',
    bolsillos: [],
  },
  {
    doc: '1012334455', nombre: 'Valentina Soto', clave: 'valentina123', cuenta: '001-556-330',
    disponible: 3200000, tipo: 'CC', correo: 'valentina.soto@correo.com', nacimiento: '1997-09-30',
    bolsillos: [{ nombre: 'Moto', saldo: 700000 }],
  },
  {
    doc: '1067889900', nombre: 'Julián Mesa', clave: 'julian123', cuenta: '007-221-884',
    disponible: 2960000, tipo: 'CE', correo: 'julian.mesa@correo.com', nacimiento: '1993-03-14',
    bolsillos: [{ nombre: 'Estudio', saldo: 500000 }],
  },
];

/* El prototipo les ponia cuenta '—'; aqui necesitan un numero propio
   porque la columna es UNIQUE. No son cuentas transaccionales. */
const INTERNOS = [
  { doc: 'admin', nombre: 'Administrador', clave: 'admin123', rol: 'admin', cuenta: 'ADM-000-001' },
  { doc: 'contable', nombre: 'Contable', clave: 'conta123', rol: 'contable', cuenta: 'CTB-000-002' },
];

function haceDias(d) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x;
}

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CO');

async function main() {
  verificarConfig();

  await enTransaccion(async (cliente) => {
    console.log('[seed] limpiando tablas...');
    await cliente.query('TRUNCATE alertas, movimientos, bolsillos, usuarios RESTART IDENTITY CASCADE');
    await cliente.query("ALTER SEQUENCE movimientos_codigo_seq RESTART WITH 8841");

    /* ---------- clientes ---------- */
    for (const c of CLIENTES) {
      const hash = await bcrypt.hash(c.clave, config.bcryptRounds);
      await cliente.query(
        `INSERT INTO usuarios
           (doc, nombre, clave_hash, correo, tipo, nacimiento, rol, cuenta,
            disponible, estado, tope_diario, tope_mensual)
         VALUES ($1,$2,$3,$4,$5,$6,'usuario',$7,$8,'activa',$9,$10)`,
        [c.doc, c.nombre, hash, c.correo, c.tipo, c.nacimiento, c.cuenta,
          c.disponible, TOPE_DIARIO, TOPE_MENSUAL],
      );
      for (const b of c.bolsillos) {
        await cliente.query(
          `INSERT INTO bolsillos (usuario_doc, nombre, saldo) VALUES ($1,$2,$3)`,
          [c.doc, b.nombre, b.saldo],
        );
      }
    }

    /* ---------- admin y contable ---------- */
    for (const i of INTERNOS) {
      const hash = await bcrypt.hash(i.clave, config.bcryptRounds);
      await cliente.query(
        `INSERT INTO usuarios
           (doc, nombre, clave_hash, correo, tipo, rol, cuenta, disponible, estado,
            tope_diario, tope_mensual)
         VALUES ($1,$2,$3,'','--',$4,$5,0,'activa',$6,$7)`,
        [i.doc, i.nombre, hash, i.rol, i.cuenta, TOPE_DIARIO, TOPE_MENSUAL],
      );
    }

    /* ---------- historial inicial ----------
       Los mismos 3 movimientos del prototipo. No alteran los saldos:
       son el pasado ya reflejado en los saldos de arriba. */
    const maria = CLIENTES[0];
    const laura = CLIENTES[2];

    const mov = async ({ tipo, estado, origen, destino, valor, nota, hace }) => {
      const { rows } = await cliente.query(
        `INSERT INTO movimientos (tipo, estado, origen, destino, valor, nota, creado_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING codigo`,
        [tipo, estado, origen, destino, valor, nota, haceDias(hace)],
      );
      return rows[0].codigo;
    };

    await mov({
      tipo: 'Transferencia', estado: 'Completada',
      origen: maria.cuenta, destino: laura.cuenta,
      valor: 180000, nota: 'Arriendo', hace: 6,
    });
    await mov({
      tipo: 'Pago', estado: 'Completada',
      origen: maria.cuenta, destino: 'EPM',
      valor: 95400, nota: 'Referencia 10993821', hace: 9,
    });
    await mov({
      tipo: 'Transferencia', estado: 'Rechazada',
      origen: maria.cuenta, destino: '009-112-000',
      valor: 4200000, nota: 'Saldo insuficiente', hace: 12,
    });

    /* ---------- alertas iniciales ---------- */
    const alerta = (doc, texto, hace) => cliente.query(
      `INSERT INTO alertas (usuario_doc, texto, creado_en) VALUES ($1,$2,$3)`,
      [doc, texto, haceDias(hace)],
    );
    await alerta(maria.doc, `Enviada ${fmt(180000)} a ${laura.nombre}`, 6);
    await alerta(laura.doc, `Recibida ${fmt(180000)} de ${maria.nombre}`, 6);
    await alerta(maria.doc, 'Transferencia rechazada por saldo insuficiente', 12);
  });

  /* ---------- verificacion del total del sistema ---------- */
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(u.disponible), 0) + COALESCE((SELECT SUM(saldo) FROM bolsillos), 0) AS total,
            count(*)::int AS clientes
     FROM usuarios u WHERE u.rol = 'usuario'`,
  );
  const total = Number(rows[0].total);
  console.log(`[seed] ${rows[0].clientes} clientes · total del sistema ${fmt(total)}`);
  if (total !== 18000000 || rows[0].clientes !== 6) {
    throw new Error(`El seed deberia dejar 6 clientes y $18.000.000, quedo ${rows[0].clientes} y ${fmt(total)}`);
  }
  console.log('[seed] listo');
}

main()
  .catch((e) => {
    console.error('[seed] falló:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
