import { after, before, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';
import { requireAuth } from '../auth/middleware';
import { issueToken } from '../auth/token';

// None of these need a database: they never reach a query.
const pool = new Pool({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
const deps = { pool, authSecret: 'security-test-secret', correlationUrl: 'http://127.0.0.1:1', webhookSecret: 'unused' };

const start = async (extra: object) => {
  const server = createApp({ ...deps, ...extra }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

after(() => pool.end());

describe('CORS', () => {
  let server: Server;
  let base: string;
  before(async () => ({ server, base } = await start({ corsOrigins: ['https://app.example.com'] })));
  after(() => server.close());

  test('allows a listed origin', async () => {
    const res = await fetch(`${base}/health`, { headers: { origin: 'https://app.example.com' } });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://app.example.com');
  });

  test('does not allow any other origin', async () => {
    const res = await fetch(`${base}/health`, { headers: { origin: 'https://evil.example.com' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

describe('trust proxy and rate limits', () => {
  const failLogin = (base: string, ip: string) =>
    fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ id: 'abc', password: 'x' }),
    });

  test('with one trusted proxy, each client IP gets its own login quota', async () => {
    const { server, base } = await start({ trustProxy: 1 });
    for (let i = 0; i < 10; i++) await failLogin(base, '203.0.113.1');
    assert.equal((await failLogin(base, '203.0.113.1')).status, 429);
    assert.equal((await failLogin(base, '203.0.113.2')).status, 401);
    server.close();
  });

  test('without a trusted proxy, a forged X-Forwarded-For cannot dodge the limit', async () => {
    // express-rate-limit logs an ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warning for exactly this forged header. That is the
    // behaviour under test, so keep it out of the test output.
    const logged = mock.method(console, 'error', () => undefined);
    const { server, base } = await start({});
    try {
      for (let i = 0; i < 10; i++) await failLogin(base, `203.0.113.${i}`);
      assert.equal((await failLogin(base, '203.0.113.99')).status, 429);
    } finally {
      logged.mock.restore();
      server.close();
    }
  });
});

describe('role lookup cache', () => {
  const run = async (middleware: ReturnType<typeof requireAuth>, token: string) => {
    const req = { headers: { authorization: `Bearer ${token}` } } as never;
    let nexted = false;
    const res = { status: () => ({ json: () => undefined }) } as never;
    await new Promise<void>((resolve) => {
      middleware(req, res, () => {
        nexted = true;
        resolve();
      });
      setTimeout(resolve, 50);
    });
    return nexted;
  };

  test('hits the database once per 30 seconds per user, then looks again', async () => {
    let queries = 0;
    const fakePool = { query: async () => (queries++, { rows: [{ id: '10001', role: 'admin', team_id: null }] }) } as unknown as Pool;
    let clock = 1_000_000;
    const middleware = requireAuth(fakePool, 'cache-secret', () => clock);
    const token = issueToken('10001', 'cache-secret');

    assert.equal(await run(middleware, token), true);
    assert.equal(await run(middleware, token), true);
    assert.equal(queries, 1);

    clock += 31_000;
    assert.equal(await run(middleware, token), true);
    assert.equal(queries, 2);
  });
});
