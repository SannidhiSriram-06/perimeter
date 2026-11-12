import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../auth/middleware';
import { wrap } from '../http';

export interface EvaluationRunSummary {
  source: string;
  run_at: string;
  environment: string;
  dry_run: boolean | null;
  notice: string;
  total: number;
  passed: number;
  pass_rate: number;
  results: unknown[];
}

export interface EvaluationResultsResponse {
  runs: EvaluationRunSummary[];
}

/**
 * Resolves the candidate results directory, checking:
 * 1. Explicit argument
 * 2. EVALUATION_RESULTS_DIR env var
 * 3. Relative to __dirname (when running in repo or container)
 * 4. Relative to process.cwd()
 */
export function resolveResultsDir(explicitDir?: string): string {
  if (explicitDir) return path.resolve(explicitDir);
  if (process.env.EVALUATION_RESULTS_DIR) {
    return path.resolve(process.env.EVALUATION_RESULTS_DIR);
  }

  const candidates = [
    path.resolve(__dirname, '../../../evaluation/benchmark/results'),
    path.resolve(__dirname, '../../../../evaluation/benchmark/results'),
    path.resolve(process.cwd(), 'evaluation/benchmark/results'),
    path.resolve(process.cwd(), '../../evaluation/benchmark/results'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fallback to primary candidate even if it does not yet exist
  return candidates[0];
}

/**
 * Parses a single benchmark or chaos summary JSON file.
 * Returns null if the file cannot be read, parsed, or does not match expected structure.
 */
export function parseRunFile(filePath: string, fileName: string): EvaluationRunSummary | null {
  try {
    const rawText = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(rawText);
    if (!data || typeof data !== 'object') return null;

    const runAt =
      data.benchmark_run_at ||
      data.harness_run_at ||
      data.run_at ||
      new Date().toISOString();

    const environment = String(data.environment || 'controlled_test_environment');
    const dryRun = data.dry_run !== undefined ? Boolean(data.dry_run) : null;
    const notice = String(data.notice || data.environment_disclaimer || '');

    const total = Number(
      data.total ??
        data.scenarios_total ??
        data.total_scenarios ??
        (Array.isArray(data.results) ? data.results.length : 0)
    );

    const passed = Number(
      data.passed ??
        data.scenarios_passed ??
        data.passed_scenarios ??
        0
    );

    const passRate = Number(
      data.pass_rate ??
        (total > 0 ? passed / total : 0)
    );

    const results = Array.isArray(data.results) ? data.results : [];

    return {
      source: fileName,
      run_at: runAt,
      environment,
      dry_run: dryRun,
      notice,
      total,
      passed,
      pass_rate: passRate,
      results,
    };
  } catch {
    // Tolerant: unparsable or inaccessible files are skipped, never 500
    return null;
  }
}

/**
 * Router exposing GET /evaluation/results for administrators.
 * Reads benchmark_results.json and chaos_run_*summary.json from results dir.
 */
export function evaluationRouter(resultsDir?: string): Router {
  const router = Router();

  router.get(
    '/evaluation/results',
    requireAdmin,
    wrap(async (_req: Request, res: Response) => {
      const targetDir = resolveResultsDir(resultsDir);
      const runs: EvaluationRunSummary[] = [];

      try {
        if (fs.existsSync(targetDir)) {
          const entries = fs.readdirSync(targetDir);
          for (const file of entries) {
            const isMatch =
              file === 'benchmark_results.json' ||
              (file.startsWith('chaos_run_') && file.endsWith('summary.json'));

            if (!isMatch) continue;

            const fullPath = path.join(targetDir, file);
            const parsed = parseRunFile(fullPath, file);
            if (parsed) runs.push(parsed);
          }
        }
      } catch {
        // Tolerant of filesystem access errors; return empty runs rather than 500
      }

      // Sort newest runs first
      runs.sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime());

      return res.status(200).json({ runs });
    })
  );

  return router;
}
