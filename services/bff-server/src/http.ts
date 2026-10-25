import { NextFunction, Request, Response } from 'express';

/** Forwards rejected promises from async handlers to Express error handling (Express 4 does not do this itself). */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
