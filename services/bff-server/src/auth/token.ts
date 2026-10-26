import { createHmac, timingSafeEqual } from 'crypto';

export interface SessionClaims {
  sub: string;
  role: 'admin' | 'team_member';
  exp: number;
}

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Issues a signed token. Role is carried for convenience only: it is re-read from the DB on every request. */
export function issueToken(sub: string, role: SessionClaims['role'], secret: string, now = Date.now()): string {
  const claims: SessionClaims = { sub, role, exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS };
  const body = b64url(JSON.stringify(claims));
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
