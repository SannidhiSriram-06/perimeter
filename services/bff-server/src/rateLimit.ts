import rateLimit from 'express-rate-limit';

const WINDOW_MS = 15 * 60 * 1000;
const message = { error: 'Too Many Requests', message: 'try again later' };

/**
 * Per-IP limits, counted in memory (one instance per app).
 * shortcut: in-memory counters are per process, so with several BFF replicas each allows its own quota; move to a shared store (Redis) when we scale out.
 */
export function createLimiters() {
  const common = { windowMs: WINDOW_MS, standardHeaders: 'draft-7', legacyHeaders: false, message } as const;
  return {
    // Authenticated API traffic: every request costs a database lookup.
    api: rateLimit({ ...common, limit: 600 }),
    // Login: only failed attempts count, so a 5-digit ID cannot be brute-forced and real users are never locked out by their own logins.
    login: rateLimit({ ...common, limit: 10, skipSuccessfulRequests: true }),
  };
}
