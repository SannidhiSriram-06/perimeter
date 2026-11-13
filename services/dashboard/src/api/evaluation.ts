import { api } from './client';

export interface InjectedFaultDetails {
  fault_type?: string;
  action?: string;
  target_service?: string;
  environment?: string;
  parameters?: Record<string, unknown>;
}

export interface ScenarioEvaluationItem {
  scenario_id: string;
  injected_fault?: InjectedFaultDetails;
  origin_service?: string;
  expected_services?: string[];
  found_services?: string[];
  excluded_services?: string[];
  precision?: number;
  recall?: number;
  f1_score?: number;
  false_positives?: string[];
  false_negatives?: string[];
  excluded_violations?: string[];
  passed?: boolean;
  threshold?: number;
  dry_run?: boolean;
}

export interface EvaluationRun {
  source: string;
  run_at: string;
  environment: string;
  dry_run: boolean | null;
  notice: string;
  total: number;
  passed: number;
  pass_rate: number;
  results: ScenarioEvaluationItem[];
}

export interface EvaluationResultsResponse {
  runs: EvaluationRun[];
}

export function fetchEvaluationResults(): Promise<EvaluationResultsResponse> {
  return api<EvaluationResultsResponse>('/api/v1/evaluation/results');
}
