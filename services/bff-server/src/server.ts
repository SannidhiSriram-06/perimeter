import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'perimeter-bff',
  });
});

/**
 * Alert Webhook Ingestion endpoint
 * POST /api/v1/alerts/webhook
 */
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

// Start listening if run directly
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Perimeter BFF server running on port ${PORT}`);
  });
}

export default app;
