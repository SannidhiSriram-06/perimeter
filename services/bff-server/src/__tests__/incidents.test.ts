import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';
import { DATABASE_URL, skipWithoutDb } from './testDb';

// Needs a Postgres with deploy/db/init.sql loaded. Skipped locally (with a warning) when TEST_DATABASE_URL is unset; fails in CI.
const SECRET = 'integration-test-secret';

describe('GET /api/v1/incidents — team-scoped visibility', { skip: skipWithoutDb }, () => {
  let pool: Pool;
  let server: Server;
  let base: string;

  // IDs of incidents inserted by this suite; cleaned up in after().
  const created: string[] = [];

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    server = createApp({ pool, authSecret: SECRET, correlationUrl: 'http://127.0.0.1:1', webhookSecret: 'unused-webhook-secret' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Insert test incidents:
    //   inc-pg  — alert on payment-gateway (owned by team-payments)
    //   inc-inv — alert on inventory-service (owned by team-core-platform)
    //   inc-null — alert_service_id NULL (unknown service, admin-only)
    const pgRow = await pool.query<{ id: string }>(
      `INSERT INTO incidents (title, status, alert_service_id, blast_radius)
       VALUES ('Test: payment-gateway incident', 'open', 'payment-gateway', '[]')
       RETURNING id`
    );
    const invRow = await pool.query<{ id: string }>(
      `INSERT INTO incidents (title, status, alert_service_id, blast_radius)
       VALUES ('Test: inventory-service incident', 'open', 'inventory-service', '[]')
       RETURNING id`
    );
    const nullRow = await pool.query<{ id: string }>(
      `INSERT INTO incidents (title, status, alert_service_id, blast_radius)
       VALUES ('Test: unknown-service incident', 'open', NULL, '[]')
       RETURNING id`
    );
    created.push(pgRow.rows[0].id, invRow.rows[0].id, nullRow.rows[0].id);
  });

  after(async () => {
    if (created.length) await pool.query('DELETE FROM incidents WHERE id = ANY($1::uuid[])', [created]);
    server.close();
    await pool.end();
  });

  const login = async (id: string, password = 'perimeter-dev') => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, password }),
    });
    return (await res.json()) as { token?: string };
  };

  const getIncidents = (token: string | null) =>
    fetch(`${base}/api/v1/incidents`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const tokenFor = async (id: string) => (await login(id)).token as string;

  const incidentIds = (body: { incidents: { id: string }[] }) =>
    body.incidents.map((i) => i.id);

  test('request without a token gets 401', async () => {
    const res = await getIncidents(null);
    assert.equal(res.status, 401);
  });

  test('admin (10001) sees incidents for all services including the NULL-service one', async () => {
    const res = await getIncidents(await tokenFor('10001'));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { incidents: { id: string }[] };
    const ids = incidentIds(body);
    // All three test incidents must be visible to admin.
    assert.ok(ids.includes(created[0]), 'admin should see payment-gateway incident');
    assert.ok(ids.includes(created[1]), 'admin should see inventory-service incident');
    assert.ok(ids.includes(created[2]), 'admin should see NULL-service incident');
  });

  test('team member 100101 (team-payments) sees payment-gateway but NOT inventory-service incident', async () => {
    const res = await getIncidents(await tokenFor('100101'));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { incidents: { id: string }[] };
    const ids = incidentIds(body);
    assert.ok(ids.includes(created[0]), '100101 should see payment-gateway incident (their team owns it)');
    assert.ok(!ids.includes(created[1]), '100101 should NOT see inventory-service incident (owned by team-core-platform)');
    assert.ok(!ids.includes(created[2]), '100101 should NOT see NULL-service incident');
  });

  test('team member 100103 (team-core-platform) sees inventory-service but NOT payment-gateway incident', async () => {
    const res = await getIncidents(await tokenFor('100103'));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { incidents: { id: string }[] };
    const ids = incidentIds(body);
    assert.ok(ids.includes(created[1]), '100103 should see inventory-service incident (their team owns it)');
    assert.ok(!ids.includes(created[0]), '100103 should NOT see payment-gateway incident (owned by team-payments)');
    assert.ok(!ids.includes(created[2]), '100103 should NOT see NULL-service incident');
  });

  test('incident with NULL alert_service_id is visible to admin but not to team members', async () => {
    const adminRes = await getIncidents(await tokenFor('10001'));
    const adminIds = incidentIds((await adminRes.json()) as { incidents: { id: string }[] });
    assert.ok(adminIds.includes(created[2]), 'admin should see NULL-service incident');

    const memberRes = await getIncidents(await tokenFor('100101'));
    const memberIds = incidentIds((await memberRes.json()) as { incidents: { id: string }[] });
    assert.ok(!memberIds.includes(created[2]), 'team member should NOT see NULL-service incident');
  });
});
