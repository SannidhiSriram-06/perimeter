import { createApp } from './app';
import { createPool } from './db';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Loaded lazily so `require('./app')` in tests does not read env or open a connection.
export function start() {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error('AUTH_SECRET is not set');
  }
  const pool = createPool();
  const app = createApp({ pool, authSecret });
  return app.listen(PORT, () => {
    console.log(`Perimeter BFF server running on port ${PORT}`);
  });
}

if (require.main === module) {
  // dotenv is loaded here, not at import time, so tests stay hermetic.
  require('dotenv').config();
  start();
}
