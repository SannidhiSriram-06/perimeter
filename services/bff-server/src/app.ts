import express, { Request, Response } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { authRouter } from './auth/routes';
import { requireAuth } from './auth/middleware';
import { teamsRouter } from './teams/routes';

export interface AppDeps {
  pool: Pool;
  authSecret: string;
}

/** Builds the Express app. Kept separate from server.ts so tests can run it without listening on a port. */
export function createApp({ pool, authSecret }: AppDeps) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'perimeter-bff',
    });
  });

  app.post('/api/v1/alerts/webhook', (req: Request, res: Response) => {
    const { alerts } = req.body || {};

    if (!alerts || !Array.isArray(alerts)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Payload must contain an 'alerts' array",
      });
    }

    console.log(
      `[${new Date().toISOString()}] [Alert Ingestion] Received webhook with ${alerts.length} alert(s):`,
      JSON.stringify(req.body, null, 2)
    );

    return res.status(202).json({
      status: 'accepted',
      alert_count: alerts.length,
    });
  });

  app.use('/api/v1/auth', authRouter(pool, authSecret));
  app.use('/api/v1', requireAuth(pool, authSecret), teamsRouter(pool));

  return app;
}
