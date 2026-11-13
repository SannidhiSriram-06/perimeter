import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EvaluationRun, fetchEvaluationResults } from '../../api/evaluation';

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
    <section style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>
          <Link to="/admin" style={{ color: '#2563eb', textDecoration: 'none' }}>
            ← Back to Admin
          </Link>
        </p>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '24px' }}>
          Evaluation Results & Accuracy Benchmark
        </h1>
        <p style={{ color: '#4b5563', margin: 0, fontSize: '14px' }}>
          Accuracy metrics and fault injection benchmarks for Perimeter blast-radius correlation.
        </p>
      </header>

      {loading && <p role="status">Loading evaluation results...</p>}

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <p>No evaluation runs found in benchmark results directory.</p>
      )}

      {!loading &&
        !error &&
        runs.map((run, idx) => {
          const passPercent = (run.pass_rate * 100).toFixed(0);
          return (
            <article
              key={`${run.source}-${idx}`}
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '2rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '12px',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>
                  {run.source}
                </h2>
                {run.dry_run === true && (
                  <span
                    role="status"
                    style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: 600,
                    }}
                  >
                    Dry run: mock data, not an accuracy result
                  </span>
                )}
              </div>

              {/* Prominent Notice Banner */}
              {run.notice && (
                <aside
                  role="note"
                  style={{
                    background: '#eff6ff',
                    borderLeft: '4px solid #3b82f6',
                    padding: '10px 14px',
                    margin: '12px 0 16px 0',
                    fontSize: '13px',
                    color: '#1e40af',
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  <strong>Notice:</strong> {run.notice}
                </aside>
              )}

              {/* Run Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span style={{ color: '#6b7280' }}>Run Time:</span>{' '}
                  <strong>{new Date(run.run_at).toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Environment:</span>{' '}
                  <code>{run.environment}</code>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>Pass Rate:</span>{' '}
                  <strong style={{ color: run.pass_rate >= 0.8 ? '#15803d' : '#b91c1c' }}>
                    {passPercent}% ({run.passed}/{run.total} passed)
                  </strong>
                </div>
              </div>

              {/* Per-Scenario Results Table */}
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '13px',
                  }}
                >
                  <thead>
                    <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '8px 10px' }}>Injected Fault</th>
                      <th style={{ padding: '8px 10px' }}>Target Service</th>
                      <th style={{ padding: '8px 10px' }}>Expected vs Found</th>
                      <th style={{ padding: '8px 10px' }}>Precision</th>
                      <th style={{ padding: '8px 10px' }}>Recall</th>
                      <th style={{ padding: '8px 10px' }}>Services Wrongly Included</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
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
                        <tr
                          key={`${sc.scenario_id}-${sIdx}`}
                          style={{
                            borderBottom: '1px solid #e5e7eb',
                            background: sIdx % 2 === 0 ? '#ffffff' : '#fafafa',
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                            {faultLabel}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <code>{target}</code>
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: '12px' }}>
                            <div>
                              <span style={{ color: '#6b7280' }}>Exp:</span> {expected}
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Fnd:</span> {found}
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                            {sc.precision !== undefined ? `${(sc.precision * 100).toFixed(0)}%` : 'N/A'}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                            {sc.recall !== undefined ? `${(sc.recall * 100).toFixed(0)}%` : 'N/A'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {wronglyIncluded.length > 0 ? (
                              <span style={{ color: '#dc2626', fontWeight: 500 }}>
                                {wronglyIncluded.join(', ')}
                              </span>
                            ) : (
                              <span style={{ color: '#6b7280' }}>None</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: sc.passed ? '#dcfce7' : '#fee2e2',
                                color: sc.passed ? '#166534' : '#991b1b',
                              }}
                            >
                              {sc.passed ? 'Passed' : 'Failed'}
                            </span>
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
