import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'net';
import { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Pool } from 'pg';
import { createApp } from '../app';
import { issueToken } from '../auth/token';
import { parseRunFile, resolveResultsDir } from '../evaluation/routes';

const SECRET = 'evaluation-test-secret';

// In-memory mock pool to avoid needing a live Postgres instance for auth role lookups
const mockPool = {
  query: async (_sql: string, params?: unknown[]) => {
    const id = params?.[0];
    if (id === '10001') {
      return { rows: [{ id: '10001', role: 'admin', team_id: null }] };
    }
    if (id === '100101') {
      return { rows: [{ id: '100101', role: 'team_member', team_id: 'team-payments' }] };
    }
    return { rows: [] };
  },
  end: async () => {},
} as unknown as Pool;

describe('GET /api/v1/evaluation/results', () => {
  let server: Server;
  let base: string;
  let tempDir: string;

  before(async () => {
    // Create isolated temporary directory with sample files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perimeter-eval-test-'));

    // 1. Valid benchmark_results.json
    fs.writeFileSync(
      path.join(tempDir, 'benchmark_results.json'),
      JSON.stringify({
        benchmark_run_at: '2026-11-01T07:47:59.000Z',
        environment: 'controlled_test_environment',
        notice: 'Controlled synthetic testbed',
        dry_run: false,
        total: 4,
        passed: 4,
        pass_rate: 1.0,
        results: [{ scenario_id: 'test-sc-1', passed: true }],
      })
    );

    // 2. Corrupt / unparsable chaos summary file (must be skipped, not 500)
    fs.writeFileSync(
      path.join(tempDir, 'chaos_run_corrupt_summary.json'),
      '{ invalid json content: true '
    );

    // 3. Valid chaos summary file
    fs.writeFileSync(
      path.join(tempDir, 'chaos_run_dryrun_summary.json'),
      JSON.stringify({
        harness_run_at: '2026-11-02T08:46:26.000Z',
        environment: 'controlled_test_environment',
        environment_disclaimer: 'Results strictly generated within controlled test environment',
        dry_run: true,
        total_scenarios: 4,
        passed_scenarios: 4,
        pass_rate: 1.0,
        results: [{ scenario_id: 'test-sc-2', passed: true }],
      })
    );

    // 4. File that does not match pattern (must be ignored)
    fs.writeFileSync(path.join(tempDir, 'other_random_file.json'), JSON.stringify({ ignore: true }));

    process.env.EVALUATION_RESULTS_DIR = tempDir;

    server = createApp({
      pool: mockPool,
      authSecret: SECRET,
      correlationUrl: 'http://127.0.0.1:1',
      webhookSecret: 'unused-webhook-secret',
    }).listen(0);

    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    delete process.env.EVALUATION_RESULTS_DIR;
    fs.rmSync(tempDir, { recursive: true, force: true });
    server.close();
  });

  test('no token returns 401 unauthorized', async () => {
    const res = await fetch(`${base}/api/v1/evaluation/results`);
    assert.equal(res.status, 401);
  });

  test('team member token returns 403 forbidden', async () => {
    const token = issueToken('100101', SECRET);
    const res = await fetch(`${base}/api/v1/evaluation/results`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'Forbidden');
    assert.match(body.message, /admin role required/i);
  });

  test('admin token returns 200 with parsed runs and skips corrupt file', async () => {
    const token = issueToken('10001', SECRET);
    const res = await fetch(`${base}/api/v1/evaluation/results`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);

    const body = (await res.json()) as { runs: Array<Record<string, unknown>> };
    assert.ok(Array.isArray(body.runs));
    // Exactly 2 runs (benchmark_results and chaos_run_dryrun; corrupt and unrelated files skipped)
    assert.equal(body.runs.length, 2);

    const sources = body.runs.map((r) => r.source);
    assert.ok(sources.includes('benchmark_results.json'));
    assert.ok(sources.includes('chaos_run_dryrun_summary.json'));

    const dryRun = body.runs.find((r) => r.source === 'chaos_run_dryrun_summary.json');
    assert.equal(dryRun?.dry_run, true);
    assert.equal(dryRun?.total, 4);
    assert.equal(dryRun?.passed, 4);
    assert.equal(dryRun?.pass_rate, 1.0);
    assert.match(String(dryRun?.notice), /controlled test environment/i);
  });

  test('missing or non-existent directory returns 200 with empty runs', async () => {
    process.env.EVALUATION_RESULTS_DIR = path.join(tempDir, 'non_existent_subdir');
    const token = issueToken('10001', SECRET);
    const res = await fetch(`${base}/api/v1/evaluation/results`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { runs: unknown[] };
    assert.deepEqual(body.runs, []);
    process.env.EVALUATION_RESULTS_DIR = tempDir;
  });

  test('parseRunFile returns null on unreadable or invalid JSON', () => {
    assert.equal(parseRunFile('/non/existent/path/file.json', 'file.json'), null);
    const badPath = path.join(tempDir, 'chaos_run_corrupt_summary.json');
    assert.equal(parseRunFile(badPath, 'chaos_run_corrupt_summary.json'), null);
  });

  test('resolveResultsDir resolves explicit or fallback directories', () => {
    assert.equal(resolveResultsDir(tempDir), path.resolve(tempDir));
  });
});
