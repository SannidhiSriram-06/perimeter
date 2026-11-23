import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';
import { DATABASE_URL, skipWithoutDb } from './testDb';

const SECRET = 'services-test-secret';

describe('GET /api/v1/services — team-scoped visibility', { skip: skipWithoutDb }, () => {
  let pool: Pool;
  let server: Server;
  let base: string;

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    server = createApp({
      pool,
      authSecret: SECRET,
      correlationUrl: 'http://127.0.0.1:1',
      webhookSecret: 'unused-webhook-secret',
    }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
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

  const tokenFor = async (id: string) => (await login(id)).token as string;

  const getServices = (token: string | null) =>
    fetch(`${base}/api/v1/services`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  test('unauthorized requests return 401 without token', async () => {
    const res = await getServices(null);
    assert.equal(res.status, 401);
  });

  test('unauthorized requests return 401 with invalid token', async () => {
    const res = await getServices('invalid-bearer-token');
    assert.equal(res.status, 401);
  });

  test('admin (10001) sees all seeded services', async () => {
    const token = await tokenFor('10001');
    const res = await getServices(token);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      services: Array<{ id: string; name: string; owning_team_id: string; tier: string }>;
    };
    assert.ok(Array.isArray(body.services));
    // All 6 services seeded in init.sql
    assert.equal(body.services.length, 6);
    const ids = body.services.map((s) => s.id);
    assert.ok(ids.includes('checkout-service'));
    assert.ok(ids.includes('payment-gateway'));
    assert.ok(ids.includes('bank-network'));
    assert.ok(ids.includes('frontend-proxy'));
    assert.ok(ids.includes('inventory-service'));
    assert.ok(ids.includes('recommendation-engine'));
  });

  const teamScopingCases = [
    {
      userId: '100101',
      teamId: 'team-payments',
      visible: ['checkout-service', 'payment-gateway', 'bank-network'],
      hidden: ['frontend-proxy', 'inventory-service', 'recommendation-engine'],
    },
    {
      userId: '100103',
      teamId: 'team-core-platform',
      visible: ['frontend-proxy', 'inventory-service', 'recommendation-engine'],
      hidden: ['checkout-service', 'payment-gateway', 'bank-network'],
    },
  ];

  for (const tc of teamScopingCases) {
    test(`team member (${tc.userId}) sees only ${tc.teamId} services`, async () => {
      const token = await tokenFor(tc.userId);
      const res = await getServices(token);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        services: Array<{ id: string; name: string; owning_team_id: string; tier: string }>;
      };
      assert.equal(body.services.length, tc.visible.length);
      for (const service of body.services) {
        assert.equal(service.owning_team_id, tc.teamId);
      }
      const ids = body.services.map((s) => s.id);
      for (const expectedId of tc.visible) {
        assert.ok(ids.includes(expectedId));
      }
      for (const hiddenId of tc.hidden) {
        assert.ok(!ids.includes(hiddenId));
      }
    });
  }
});
