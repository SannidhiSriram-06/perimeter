import { createApp } from './app';
import { createPool } from './db';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Loaded lazily so `require('./app')` in tests does not read env or open a connection.
export function start() {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error('AUTH_SECRET is not set');
  }
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('WEBHOOK_SECRET is not set');
  }
  const pool = createPool();
  const correlationUrl = process.env.CORRELATION_URL ?? 'http://localhost:8000';
  const app = createApp({ pool, authSecret, correlationUrl, webhookSecret });
  const server = app.listen(PORT, () => {
    console.log(`Perimeter BFF server running on port ${PORT}`);
  });
  // SIGTERM comes from Kubernetes on rollout, SIGINT from Ctrl+C and compose restarts: finish in-flight requests, release DB connections.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => server.close(() => pool.end()));
  }
  return server;
}

if (require.main === module) {
  // dotenv is loaded here, not at import time, so tests stay hermetic.
  require('dotenv').config();
  start();
}
