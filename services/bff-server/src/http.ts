import { NextFunction, Request, Response } from 'express';

/** One response for every authentication failure, so callers cannot tell a bad ID from a bad token. */
export const unauthorized = (res: Response) =>
  res.status(401).json({ error: 'Unauthorized', message: 'invalid credentials' });

/** Forwards rejected promises from async handlers to Express error handling (Express 4 does not do this itself). */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
