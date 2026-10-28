import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionClaims {
  sub: string;
  exp: number;
}

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Issues a signed token. It carries no role: role and team are read from the DB on every request. */
export function issueToken(sub: string, secret: string, now = Date.now()): string {
  const claims: SessionClaims = { sub, exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** Returns the claims for a valid, unexpired token, or null for anything else. */
export function verifyToken(token: string, secret: string, now = Date.now()): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
