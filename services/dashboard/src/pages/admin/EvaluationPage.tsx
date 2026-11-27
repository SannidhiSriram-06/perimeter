import { useEffect, useState } from 'react';
import { EvaluationRun, fetchEvaluationResults } from '../../api/evaluation';
import { PageHead, Status } from '../../components/ui';

export default function EvaluationPage() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchEvaluationResults()
      .then((data) => {
        if (active) {
          setRuns(data.runs || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Failed to load evaluation results');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <PageHead
        kicker="measured, in a controlled test bed"
        title="Evaluation Results & Accuracy Benchmark"
        lead="Accuracy metrics and fault injection benchmarks for Perimeter blast-radius correlation."
      />

      {loading && <p role="status">Loading evaluation results...</p>}

      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <p className="dashed">No evaluation runs found in benchmark results directory.</p>
      )}

      {!loading &&
        !error &&
        runs.map((run, idx) => {
          const passPercent = (run.pass_rate * 100).toFixed(0);
          return (
            <article key={`${run.source}-${idx}`} className="card" style={{ marginTop: 28 }}>
              <div className="card-head">
                <h2>{run.source}</h2>
                {run.dry_run === true && (
                  <output className="chip root">
                    Dry run: mock data, not an accuracy result
                  </output>
                )}
              </div>

              {/* Prominent Notice Banner */}
              {run.notice && (
                <aside role="note" className="banner" style={{ margin: '0 0 18px' }}>
                  <strong>Notice:</strong> {run.notice}
                </aside>
              )}

              {/* Run Metadata Grid */}
              <p className="meta" style={{ margin: '0 0 18px' }}>
                <span>Run time: <strong>{new Date(run.run_at).toLocaleString()}</strong></span>
                <span>Environment: <code className="mono">{run.environment}</code></span>
                <Status tone={run.pass_rate >= 0.8 ? 'ok' : 'hot'}>
                  Pass rate: {passPercent}% ({run.passed}/{run.total} passed)
                </Status>
              </p>

              {/* Per-Scenario Results Table */}
              <div className="scroll">
                <table style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>Injected Fault</th>
                      <th>Target Service</th>
                      <th>Expected vs Found</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>Services Wrongly Included</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.results.map((sc, sIdx) => {
                      const fault = sc.injected_fault;
                      const faultLabel = fault
                        ? `${fault.fault_type || ''} (${fault.action || 'fault'})`
                        : sc.scenario_id;
                      const target = fault?.target_service || sc.origin_service || 'N/A';

                      const expected = (sc.expected_services || []).join(', ') || 'none';
                      const found = (sc.found_services || []).join(', ') || 'none';

                      const wronglyIncluded = [
                        ...(sc.false_positives || []),
                        ...(sc.excluded_violations || []),
                      ];

                      return (
                        <tr key={`${sc.scenario_id}-${sIdx}`}>
                          <td><strong>{faultLabel}</strong></td>
                          <td><code className="mono">{target}</code></td>
                          <td>
                            <div><span className="muted">Exp:</span> {expected}</div>
                            <div><span className="muted">Fnd:</span> {found}</div>
                          </td>
                          <td>{sc.precision !== undefined ? `${(sc.precision * 100).toFixed(0)}%` : 'N/A'}</td>
                          <td>{sc.recall !== undefined ? `${(sc.recall * 100).toFixed(0)}%` : 'N/A'}</td>
                          <td>
                            {wronglyIncluded.length > 0 ? (
                              <span className="error">{wronglyIncluded.join(', ')}</span>
                            ) : (
                              <span className="muted">None</span>
                            )}
                          </td>
                          <td>
                            <Status tone={sc.passed ? 'ok' : 'hot'}>{sc.passed ? 'Passed' : 'Failed'}</Status>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
    </section>
  );
}
