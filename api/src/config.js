/* Configuracion unica del backend. Todo sale de variables de
   entorno; no hay secretos escritos en el codigo (ver .env.example). */

import 'dotenv/config';

const requeridas = ['DATABASE_URL', 'JWT_SECRET'];

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  // RNF-01: la sesion caduca a los 10 minutos de emitida
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '10m',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  entorno: process.env.NODE_ENV || 'development',
};

export function verificarConfig() {
  const faltan = requeridas.filter((k) => !process.env[k]);
  if (faltan.length) {
    throw new Error(
      `Faltan variables de entorno: ${faltan.join(', ')}. Copia .env.example a .env y complétalo.`,
    );
  }
  if (config.jwtSecret && config.jwtSecret.length < 16) {
    throw new Error('JWT_SECRET debe tener al menos 16 caracteres.');
  }
  return config;
}
