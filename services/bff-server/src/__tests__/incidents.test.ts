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

  test('GET /incidents includes reviewed_draft, reviewed_by, reviewed_at, and finalized_at fields', async () => {
    const res = await getIncidents(await tokenFor('10001'));
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      incidents: Array<{
        id: string;
        reviewed_draft: unknown;
        reviewed_by: unknown;
        reviewed_at: unknown;
        finalized_at: unknown;
      }>;
    };
    assert.ok(body.incidents.length > 0);
    const first = body.incidents[0];
    assert.ok('reviewed_draft' in first, 'reviewed_draft must be present in response');
    assert.ok('reviewed_by' in first, 'reviewed_by must be present in response');
    assert.ok('reviewed_at' in first, 'reviewed_at must be present in response');
    assert.ok('finalized_at' in first, 'finalized_at must be present in response');
  });
});

describe('PATCH /api/v1/incidents/:id/draft — edit and finalize draft', { skip: skipWithoutDb }, () => {
  let pool: Pool;
  let server: Server;
  let base: string;

  const created: string[] = [];
  let paymentsIncidentId: string;
  let platformIncidentId: string;
  const initialRootCauseDraft = JSON.stringify({
    status: 'ok',
    draft: {
      hypothesis: {
        summary: 'Original AI summary for checkout',
        root_cause_service: 'checkout-service',
        cascade_path: ['checkout-service', 'payment-gateway'],
        confidence: 'medium',
      },
      claims: [
        { id: 'c1', type: 'service_ref', text: 'checkout-service latency', evidence_ids: ['span-1'] }
      ],
      postmortem: {
        summary: 'Original AI postmortem',
        impact: 'Users experienced timeouts',
        contributing_factors: ['Connection pool saturation'],
        next_steps: ['Scale connection pool'],
      },
    },
    validation: { supported: true },
  });

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    server = createApp({ pool, authSecret: SECRET, correlationUrl: 'http://127.0.0.1:1', webhookSecret: 'unused-webhook-secret' }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // payments incident (checkout-service owned by team-payments)
    const pRow = await pool.query<{ id: string }>(
      `INSERT INTO incidents (title, status, alert_service_id, blast_radius, root_cause_draft)
       VALUES ('Test: Draft edit checkout', 'open', 'checkout-service', '["checkout-service"]'::jsonb, $1)
       RETURNING id`,
      [initialRootCauseDraft]
    );
    paymentsIncidentId = pRow.rows[0].id;
    created.push(paymentsIncidentId);

    // platform incident (inventory-service owned by team-core-platform)
    const invRow = await pool.query<{ id: string }>(
      `INSERT INTO incidents (title, status, alert_service_id, blast_radius, root_cause_draft)
       VALUES ('Test: Draft edit inventory', 'open', 'inventory-service', '["inventory-service"]'::jsonb, $1)
       RETURNING id`,
      [initialRootCauseDraft]
    );
    platformIncidentId = invRow.rows[0].id;
    created.push(platformIncidentId);
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

  const tokenFor = async (id: string) => (await login(id)).token as string;

  const patchDraft = (id: string, body: unknown, token: string | null) =>
    fetch(`${base}/api/v1/incidents/${id}/draft`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  test('1. Admin can edit an incident', async () => {
    const token = await tokenFor('10001');
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: {
          summary: 'Admin updated hypothesis summary',
          confidence: 'high',
        },
      },
      token
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { incident: { reviewed_draft: any; reviewed_by: string; reviewed_at: string; status: string } };
    assert.equal(data.incident.reviewed_draft.hypothesis.summary, 'Admin updated hypothesis summary');
    assert.equal(data.incident.reviewed_draft.hypothesis.confidence, 'high');
    assert.equal(data.incident.reviewed_draft.hypothesis.root_cause_service, 'checkout-service');
    assert.equal(data.incident.reviewed_by, '10001');
    assert.ok(data.incident.reviewed_at);
    assert.equal(data.incident.status, 'open');
  });

  test('2. Owning-team member can edit an incident', async () => {
    const token = await tokenFor('100101'); // team-payments member
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: {
          summary: 'Team member updated hypothesis',
          cascade_path: ['checkout-service', 'payment-gateway', 'bank-network'],
        },
        postmortem: {
          summary: 'Postmortem summary by team',
          impact: 'Payments delayed by 2 seconds',
          contributing_factors: ['DB latency', 'Network queue'],
          next_steps: ['Add indexes', 'Tune timeouts'],
        },
      },
      token
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { incident: { reviewed_draft: any; reviewed_by: string } };
    assert.equal(data.incident.reviewed_draft.hypothesis.summary, 'Team member updated hypothesis');
    assert.deepEqual(data.incident.reviewed_draft.hypothesis.cascade_path, ['checkout-service', 'payment-gateway', 'bank-network']);
    assert.equal(data.incident.reviewed_draft.postmortem.impact, 'Payments delayed by 2 seconds');
    assert.equal(data.incident.reviewed_by, '100101');
  });

  test('3. Other-team member receives 403', async () => {
    const token = await tokenFor('100103'); // team-core-platform member attempting to edit team-payments incident
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: { summary: 'Cross-team edit attempt' },
      },
      token
    );
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Forbidden');
  });

  test('4. Unknown incident returns 404', async () => {
    const token = await tokenFor('10001');
    const randomUuid = '00000000-0000-0000-0000-000000000000';
    const res404 = await patchDraft(randomUuid, { finalize: false }, token);
    assert.equal(res404.status, 404);

    const resNonUuid = await patchDraft('not-a-uuid', { finalize: false }, token);
    assert.equal(resNonUuid.status, 404);
  });

  test('5. Invalid request body returns 400', async () => {
    const token = await tokenFor('100101');

    // Empty body
    const emptyRes = await patchDraft(paymentsIncidentId, {}, token);
    assert.equal(emptyRes.status, 400);

    // Unknown top-level key
    const unknownRes = await patchDraft(paymentsIncidentId, { unknown_key: true }, token);
    assert.equal(unknownRes.status, 400);

    // Invalid confidence value
    const confRes = await patchDraft(paymentsIncidentId, { hypothesis: { confidence: 'extreme' } }, token);
    assert.equal(confRes.status, 400);

    // summary exceeds 500 characters
    const longSummaryRes = await patchDraft(paymentsIncidentId, { hypothesis: { summary: 'a'.repeat(501) } }, token);
    assert.equal(longSummaryRes.status, 400);

    // cascade_path empty array
    const emptyPathRes = await patchDraft(paymentsIncidentId, { hypothesis: { cascade_path: [] } }, token);
    assert.equal(emptyPathRes.status, 400);

    // postmortem summary exceeds 800 characters
    const longPmSummaryRes = await patchDraft(paymentsIncidentId, { postmortem: { summary: 'b'.repeat(801) } }, token);
    assert.equal(longPmSummaryRes.status, 400);

    // contributing_factor exceeds 300 characters
    const longFactorRes = await patchDraft(
      paymentsIncidentId,
      { postmortem: { contributing_factors: ['c'.repeat(301)] } },
      token
    );
    assert.equal(longFactorRes.status, 400);

    // finalize is not boolean
    const badFinalizeRes = await patchDraft(paymentsIncidentId, { finalize: 'yes' }, token);
    assert.equal(badFinalizeRes.status, 400);

    // Empty hypothesis object
    const emptyHypRes = await patchDraft(paymentsIncidentId, { hypothesis: {} }, token);
    assert.equal(emptyHypRes.status, 400);
  });

  test('6. Original root_cause_draft remains unchanged', async () => {
    const token = await tokenFor('100101');
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: { summary: 'New summary ensuring draft preservation' },
      },
      token
    );
    assert.equal(res.status, 200);

    const dbRow = await pool.query<{ root_cause_draft: string }>(
      'SELECT root_cause_draft FROM incidents WHERE id = $1',
      [paymentsIncidentId]
    );
    assert.equal(dbRow.rows[0].root_cause_draft, initialRootCauseDraft);
  });

  test('7 & 8. Finalization updates status to final and sets finalized_at', async () => {
    const token = await tokenFor('100101');
    const res = await patchDraft(
      paymentsIncidentId,
      {
        finalize: true,
      },
      token
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { incident: { status: string; finalized_at: string; reviewed_by: string } };
    assert.equal(data.incident.status, 'final');
    assert.ok(data.incident.finalized_at);
    assert.equal(data.incident.reviewed_by, '100101');

    // Confirm in DB
    const dbRow = await pool.query<{ status: string; finalized_at: Date }>(
      'SELECT status, finalized_at FROM incidents WHERE id = $1',
      [paymentsIncidentId]
    );
    assert.equal(dbRow.rows[0].status, 'final');
    assert.ok(dbRow.rows[0].finalized_at);
  });

  test('9. Team member editing a final incident receives 409', async () => {
    const token = await tokenFor('100101');
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: { summary: 'Attempting to edit finalized incident as team member' },
      },
      token
    );
    assert.equal(res.status, 409);
    const data = (await res.json()) as { error: string };
    assert.equal(data.error, 'Conflict');
  });

  test('10. Admin can still edit a final incident', async () => {
    const token = await tokenFor('10001');
    const res = await patchDraft(
      paymentsIncidentId,
      {
        hypothesis: { summary: 'Admin overriding finalized incident draft' },
      },
      token
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { incident: { reviewed_draft: any; status: string } };
    assert.equal(data.incident.status, 'final');
    assert.equal(data.incident.reviewed_draft.hypothesis.summary, 'Admin overriding finalized incident draft');
  });
});
