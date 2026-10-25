import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';

// Needs a Postgres with deploy/db/init.sql loaded. Skipped when TEST_DATABASE_URL is unset.
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const SECRET = 'integration-test-secret';

describe('BFF API against seeded Postgres', { skip: !DATABASE_URL && 'TEST_DATABASE_URL not set' }, () => {
  let pool: Pool;
  let server: Server;
  let base: string;

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    server = createApp({ pool, authSecret: SECRET }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.close();
    await pool.end();
  });

  const login = async (id: string) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return { status: res.status, body: (await res.json()) as { token?: string; role?: string; message?: string } };
  };

  const call = (method: string, path: string, token: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const tokenFor = async (id: string) => (await login(id)).body.token as string;

  test('admin login returns an admin token', async () => {
    const res = await login('10001');
    assert.equal(res.status, 200);
    assert.equal(res.body.role, 'admin');
  });

  test('unknown, malformed and wrong-length IDs get the same generic response', async () => {
    const unknown = await login('99999');
    const malformed = await login('abc');
    const wrongLength = await login('1234');
    for (const r of [unknown, malformed, wrongLength]) {
      assert.equal(r.status, 401);
      assert.equal(r.body.message, 'invalid credentials');
    }
  });

  test('requests without a valid token are refused', async () => {
    const res = await fetch(`${base}/api/v1/teams`);
    assert.equal(res.status, 401);
  });

  test('team member sees only their own team', async () => {
    const res = await call('GET', '/api/v1/teams', await tokenFor('100101'));
    const body = (await res.json()) as { teams: { id: string }[] };
    assert.deepEqual(body.teams.map((t) => t.id), ['team-payments']);
  });

  test('admin sees every team', async () => {
    const res = await call('GET', '/api/v1/teams', await tokenFor('10001'));
    const body = (await res.json()) as { teams: { id: string }[] };
    assert.ok(body.teams.length >= 2);
  });

  test('team member cannot read another team\'s members', async () => {
    const res = await call('GET', '/api/v1/teams/team-core-platform/members', await tokenFor('100101'));
    assert.equal(res.status, 403);
  });

  test('team member cannot change leave or on-call status', async () => {
    const res = await call('PATCH', '/api/v1/members/100101/status', await tokenFor('100101'), { is_on_leave: true });
    assert.equal(res.status, 403);
  });

  test('admin updates a member, then restores the original values', async () => {
    const admin = await tokenFor('10001');
    const before = await (await call('GET', '/api/v1/members/100102', admin)).json() as { member: { is_on_leave: boolean; seniority: string }[] };
    const original = before.member[0];

    const changed = await call('PATCH', '/api/v1/members/100102/status', admin, { is_on_leave: true, seniority: 'senior' });
    assert.equal(changed.status, 200);

    await call('PATCH', '/api/v1/members/100102/status', admin, {
      is_on_leave: original.is_on_leave,
      seniority: original.seniority,
    });
  });

  test('admin PATCH rejects invalid seniority', async () => {
    const res = await call('PATCH', '/api/v1/members/100102/status', await tokenFor('10001'), { seniority: 'chief' });
    assert.equal(res.status, 400);
  });
});
