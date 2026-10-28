import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { authRouter } from './auth/routes';
import { requireAuth } from './auth/middleware';
import { teamsRouter } from './teams/routes';
import { alertsRouter } from './alerts/routes';
import { createLimiters } from './rateLimit';

export interface AppDeps {
  pool: Pool;
  authSecret: string;
  /** Base URL of the correlation engine, e.g. http://localhost:8000 */
  correlationUrl: string;
  /** Shared secret Alertmanager must send as a bearer token */
  webhookSecret: string;
}

/** Builds the Express app. Kept separate from server.ts so tests can run it without listening on a port. */
export function createApp({ pool, authSecret, correlationUrl, webhookSecret }: AppDeps) {
  const app = express();
  app.use(cors());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'perimeter-bff',
    });
  });

  app.use('/api/v1/alerts', alertsRouter(pool, correlationUrl, webhookSecret));
  app.use(express.json());

  const limiters = createLimiters();
  app.use('/api/v1/auth', limiters.login, authRouter(pool, authSecret));
  app.use('/api/v1', limiters.api, requireAuth(pool, authSecret), teamsRouter(pool));

  // Last, so rejected handlers (e.g. database down) get a JSON 500 instead of Express's HTML stack trace.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('Unhandled error:', err.message);
    res.status(status).json({ error: status === 500 ? 'Internal Server Error' : err.message });
  });

  return app;
}
