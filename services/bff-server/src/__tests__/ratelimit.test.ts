import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';

// Needs no database: malformed IDs are rejected before any query, and /health never touches the pool.
describe('rate limiting', () => {
  let pool: Pool;
  let server: Server;
  let base: string;

  before(async () => {
    pool = new Pool({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
    server = createApp({ pool, authSecret: 'rate-limit-test-secret', correlationUrl: 'http://127.0.0.1:1', webhookSecret: 'unused-webhook-secret' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.close();
    await pool.end();
  });

  const badLogin = () =>
    fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'abc' }),
    });

  test('login blocks the 11th failed attempt with 429', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await badLogin()).status, 401);
    const blocked = await badLogin();
    assert.equal(blocked.status, 429);
    assert.equal(((await blocked.json()) as { error: string }).error, 'Too Many Requests');
  });

  test('health check is never rate limited', async () => {
    for (let i = 0; i < 20; i++) assert.equal((await fetch(`${base}/health`)).status, 200);
  });
});
