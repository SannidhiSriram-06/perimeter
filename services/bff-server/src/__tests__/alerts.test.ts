import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import http, { Server } from 'http';
import { Pool } from 'pg';
import { createApp } from '../app';

// Needs a Postgres with deploy/db/init.sql loaded. Skipped when TEST_DATABASE_URL is unset.
const DATABASE_URL = process.env.TEST_DATABASE_URL;

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  );

describe('alert webhook', { skip: !DATABASE_URL && 'TEST_DATABASE_URL not set' }, () => {
  let pool: Pool;
  let engine: Server;
  let bff: Server;
  let base: string;
  let engineUp = true;
  const created: string[] = [];

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    // Stand-in correlation engine: the blast radius of any service is itself plus payment-gateway.
    engine = http.createServer((req, res) => {
      if (!engineUp) {
        res.writeHead(503).end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { service } = JSON.parse(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ origin_service: service, impacted_services: [service, 'payment-gateway'] }));
      });
    });
    const engineUrl = await listen(engine);
    bff = createApp({ pool, authSecret: 'alerts-test-secret', correlationUrl: engineUrl }).listen(0);
    await new Promise((resolve) => bff.once('listening', resolve));
    base = `http://127.0.0.1:${(bff.address() as AddressInfo).port}`;
  });

  after(async () => {
    if (created.length) await pool.query('DELETE FROM incidents WHERE id = ANY($1::uuid[])', [created]);
    bff.close();
    engine.close();
    await pool.end();
  });

  const post = (body: unknown) =>
    fetch(`${base}/api/v1/alerts/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const alert = (service: string, status = 'firing') => ({ status, labels: { alertname: 'HighLatency', service } });

  test('rejects a payload without an alerts array', async () => {
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ alerts: 'nope' })).status, 400);
  });

  test('stores one incident per firing alert with its blast radius', async () => {
    const res = await post({ alerts: [alert('checkout-service'), alert('inventory-service', 'resolved')] });
    assert.equal(res.status, 202);
    const body = (await res.json()) as { alert_count: number; incident_ids: string[] };
    assert.equal(body.alert_count, 2);
    assert.equal(body.incident_ids.length, 1);
    created.push(...body.incident_ids);

    const { rows } = await pool.query('SELECT title, status, alert_service_id, blast_radius FROM incidents WHERE id = $1', [
      body.incident_ids[0],
    ]);
    assert.equal(rows[0].title, 'HighLatency on checkout-service');
    assert.equal(rows[0].status, 'open');
    assert.equal(rows[0].alert_service_id, 'checkout-service');
    assert.deepEqual(rows[0].blast_radius, ['checkout-service', 'payment-gateway']);
  });

  test('still stores the incident when the engine is down', async () => {
    engineUp = false;
    const res = await post({ alerts: [alert('not-a-known-service')] });
    engineUp = true;
    assert.equal(res.status, 202);
    const { incident_ids } = (await res.json()) as { incident_ids: string[] };
    created.push(...incident_ids);

    const { rows } = await pool.query('SELECT status, alert_service_id, blast_radius FROM incidents WHERE id = $1', [incident_ids[0]]);
    assert.equal(rows[0].status, 'correlation_failed');
    assert.equal(rows[0].alert_service_id, null); // unknown services must not break the foreign key
    assert.deepEqual(rows[0].blast_radius, []);
  });
});
