import { createApp } from './app';
import { createPool } from './db';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_MARKERS = ['change_me', 'changeme', 'your_', 'example'];

/** Rejects a missing, short or placeholder secret, so the value from .env.example can never sign a session. */
export function requireStrongSecret(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set`);
  const lower = value.toLowerCase();
  if (value.length < MIN_SECRET_LENGTH || PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) {
    throw new Error(`${name} must be a random value of at least ${MIN_SECRET_LENGTH} characters (not a placeholder)`);
  }
  return value;
}

// Loaded lazily so `require('./app')` in tests does not read env or open a connection.
export function start() {
  const authSecret = requireStrongSecret('AUTH_SECRET', process.env.AUTH_SECRET);
  const webhookSecret = requireStrongSecret('WEBHOOK_SECRET', process.env.WEBHOOK_SECRET);
  const pool = createPool();
  const correlationUrl = process.env.CORRELATION_URL ?? 'http://localhost:8000';
  const app = createApp({
    pool,
    authSecret,
    correlationUrl,
    webhookSecret,
    corsOrigins: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean),
    trustProxy: Number(process.env.TRUST_PROXY ?? 0) || 0,
  });
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
