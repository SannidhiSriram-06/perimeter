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
    server = createApp({ pool, authSecret: SECRET, correlationUrl: 'http://127.0.0.1:1', webhookSecret: 'unused-webhook-secret' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server.close();
    await pool.end();
  });

  const login = async (id: string, password: string | undefined = 'perimeter-dev') => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, password }),
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

  test('wrong or missing password is refused with the same generic response', async () => {
    for (const r of [await login('10001', 'wrong-password'), await login('10001', '')]) {
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
    const before = await (await call('GET', '/api/v1/members/100102', admin)).json() as { member: { is_on_leave: boolean; seniority: string } };
    const original = before.member;

    const changed = await call('PATCH', '/api/v1/members/100102/status', admin, { is_on_leave: true, seniority: 'senior' });
    assert.equal(changed.status, 200);

    await call('PATCH', '/api/v1/members/100102/status', admin, {
      is_on_leave: original.is_on_leave,
      seniority: original.seniority,
    });
  });

  test('member endpoints return one object, not an array', async () => {
    const res = await call('GET', '/api/v1/members/100101', await tokenFor('100101'));
    const body = (await res.json()) as { member: { user_id: string; team_id: string } };
    assert.equal(body.member.user_id, '100101');
    assert.equal(body.member.team_id, 'team-payments');
  });

  test('unknown member is 404 and another team\'s member is 403 for a team member', async () => {
    assert.equal((await call('GET', '/api/v1/members/999999', await tokenFor('10001'))).status, 404);
    assert.equal((await call('GET', '/api/v1/members/100103', await tokenFor('100101'))).status, 403);
  });

  test('a user in two teams must be addressed with team_id, and only that team is changed', async () => {
    await pool.query(
      `INSERT INTO team_members (user_id, team_id, seniority) VALUES ('100101', 'team-core-platform', 'junior')`
    );
    try {
      const admin = await tokenFor('10001');
      assert.equal((await call('PATCH', '/api/v1/members/100101/status', admin, { is_on_leave: true })).status, 409);
      assert.equal((await call('GET', '/api/v1/members/100101', admin)).status, 409);

      const res = await call('PATCH', '/api/v1/members/100101/status', admin, { team_id: 'team-core-platform', is_on_leave: true });
      assert.equal(res.status, 200);
      const { rows } = await pool.query('SELECT team_id, is_on_leave FROM team_members WHERE user_id = $1 ORDER BY team_id', ['100101']);
      assert.deepEqual(rows.map((r) => [r.team_id, r.is_on_leave]), [['team-core-platform', true], ['team-payments', false]]);
    } finally {
      await pool.query(`DELETE FROM team_members WHERE user_id = '100101' AND team_id = 'team-core-platform'`);
    }
  });

  test('admin PATCH rejects invalid seniority', async () => {
    const res = await call('PATCH', '/api/v1/members/100102/status', await tokenFor('10001'), { seniority: 'chief' });
    assert.equal(res.status, 400);
  });
});
