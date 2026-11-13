import { useEffect, useState } from 'react';
import {
  fetchTeamServices,
  fetchTeamIncidents,
  parseIncidentDraft,
  IncidentItem,
  ServiceItem,
  ParsedIncidentDraft,
} from '../../api/team';

export default function TeamPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([fetchTeamServices(), fetchTeamIncidents()])
      .then(([servicesRes, incidentsRes]) => {
        if (!active) return;
        setServices(servicesRes.services || []);
        const incidentList = incidentsRes.incidents || [];
        setIncidents(incidentList);
        if (incidentList.length > 0) {
          setSelectedIncidentId(incidentList[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load team dashboard');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedIncident = incidents.find((inc) => inc.id === selectedIncidentId);
  const parsedDraft: ParsedIncidentDraft | null = selectedIncident
    ? parseIncidentDraft(selectedIncident)
    : null;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 6px 0', color: '#111827' }}>Team</h1>
        <p style={{ margin: 0, color: '#4b5563', fontSize: '14px' }}>
          Overview of your team's owned services, active incidents, and automated AI drafts.
        </p>
      </header>

      {/* D. Team-scoping notice banner */}
      <div
        role="region"
        aria-label="Scope notice"
        style={{
          background: '#e0e7ff',
          border: '1px solid #c7d2fe',
          color: '#3730a3',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontWeight: 'bold' }}>ℹ️ Scope:</span>
        <span>This dashboard shows only the services and incidents owned by your team.</span>
      </div>

      {/* E. UI States: Loading */}
      {loading && (
        <div role="status" style={{ padding: '24px 0', color: '#6b7280', fontSize: '15px' }}>
          Loading team dashboard...
        </div>
      )}

      {/* E. UI States: Error */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '14px 18px',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div>
          {/* A. Owned Services Section */}
          <section style={{ marginBottom: '2rem' }} aria-labelledby="owned-services-heading">
            <h2 id="owned-services-heading" style={{ fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>
              Owned Services ({services.length})
            </h2>

            {services.length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No services owned by your team.</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '12px',
                }}
              >
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    data-testid={`service-card-${svc.id}`}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '15px', color: '#111827', marginBottom: '6px' }}>
                      {svc.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>Tier:</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          background:
                            svc.tier === 'critical' ? '#fee2e2' : svc.tier === 'high' ? '#ffedd5' : '#f3f4f6',
                          color:
                            svc.tier === 'critical' ? '#991b1b' : svc.tier === 'high' ? '#9a3412' : '#374151',
                        }}
                      >
                        {svc.tier}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* B. Team Incidents Section */}
          <section style={{ marginBottom: '2rem' }} aria-labelledby="team-incidents-heading">
            <h2 id="team-incidents-heading" style={{ fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>
              Team Incidents ({incidents.length})
            </h2>

            {incidents.length === 0 ? (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px dashed #d1d5db',
                  borderRadius: '8px',
                  padding: '32px',
                  textAlign: 'center',
                  color: '#6b7280',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '8px' }}>🛡️</div>
                <div style={{ fontWeight: 600, color: '#374151' }}>No incidents found</div>
                <div style={{ fontSize: '13px' }}>Your team services are running nominally with no firing alerts.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                {incidents.map((inc) => {
                  const draft = parseIncidentDraft(inc);
                  const isSelected = inc.id === selectedIncidentId;
                  return (
                    <div
                      key={inc.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedIncidentId(inc.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedIncidentId(inc.id);
                      }}
                      data-testid={`incident-item-${inc.id}`}
                      style={{
                        background: isSelected ? '#f8fafc' : '#ffffff',
                        border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '14px 18px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: '#111827', marginBottom: '4px' }}>
                          {inc.title}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span>Service: <strong>{inc.service_name || inc.alert_service_id || 'Unknown'}</strong></span>
                          <span>Status: <strong>{inc.status}</strong></span>
                          <span>Created: {new Date(inc.created_at).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Draft status badge: ok, flagged, or none */}
                      <div>
                        {draft.status === 'ok' && (
                          <span
                            data-testid="draft-status-badge"
                            style={{
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #bbf7d0',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            ✓ DRAFT OK
                          </span>
                        )}
                        {draft.status === 'flagged' && (
                          <span
                            data-testid="draft-status-badge"
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            ⚠️ DRAFT FLAGGED
                          </span>
                        )}
                        {draft.status === 'none' && (
                          <span
                            data-testid="draft-status-badge"
                            style={{
                              background: '#f3f4f6',
                              color: '#4b5563',
                              border: '1px solid #e5e7eb',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            DRAFT NONE
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* C. Read-only incident detail */}
          {selectedIncident && (
            <section
              aria-labelledby="incident-detail-heading"
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                marginBottom: '2rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 id="incident-detail-heading" style={{ fontSize: '20px', margin: 0, color: '#111827' }}>
                  Incident Detail: {selectedIncident.title}
                </h2>
                <span
                  style={{
                    background: '#f3f4f6',
                    color: '#4b5563',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  🔒 Read-Only
                </span>
              </div>

              {/* Blast radius */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Blast Radius ({selectedIncident.blast_radius?.length || 0} services)
                </div>
                {selectedIncident.blast_radius && selectedIncident.blast_radius.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedIncident.blast_radius.map((svcName) => (
                      <span
                        key={svcName}
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          border: '1px solid #bae6fd',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {svcName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No blast radius recorded.</p>
                )}
              </div>

              {/* Drafted hypothesis */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Root Cause Hypothesis
                </div>
                {parsedDraft?.hypothesis ? (
                  <div
                    style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>Root Cause Service: </span>
                      <strong style={{ color: '#111827' }}>
                        {parsedDraft.hypothesis.root_cause_service || 'Not specified'}
                      </strong>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>Cascade Path: </span>
                      {parsedDraft.hypothesis.cascade_path && parsedDraft.hypothesis.cascade_path.length > 0 ? (
                        <span style={{ fontWeight: 600, color: '#4f46e5' }}>
                          {parsedDraft.hypothesis.cascade_path.join(' ➔ ')}
                        </span>
                      ) : (
                        <span style={{ color: '#6b7280' }}>None</span>
                      )}
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>Confidence: </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          background:
                            parsedDraft.hypothesis.confidence === 'high'
                              ? '#dcfce7'
                              : parsedDraft.hypothesis.confidence === 'medium'
                              ? '#fef3c7'
                              : '#f3f4f6',
                          color:
                            parsedDraft.hypothesis.confidence === 'high'
                              ? '#166534'
                              : parsedDraft.hypothesis.confidence === 'medium'
                              ? '#92400e'
                              : '#374151',
                        }}
                      >
                        {parsedDraft.hypothesis.confidence || 'unknown'}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                        Summary:
                      </span>
                      <p style={{ margin: 0, color: '#1f2937', fontSize: '14px', lineHeight: 1.5 }}>
                        {parsedDraft.hypothesis.summary || 'No summary drafted.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No hypothesis available for this incident.</p>
                )}
              </div>

              {/* Postmortem information when available */}
              {parsedDraft?.postmortem && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Postmortem Details
                  </div>
                  <div
                    style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      padding: '16px',
                    }}
                  >
                    {parsedDraft.postmortem.summary && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Summary:</span>
                        <p style={{ margin: 0, fontSize: '14px', color: '#1f2937' }}>{parsedDraft.postmortem.summary}</p>
                      </div>
                    )}
                    {parsedDraft.postmortem.impact && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Impact:</span>
                        <p style={{ margin: 0, fontSize: '14px', color: '#1f2937' }}>{parsedDraft.postmortem.impact}</p>
                      </div>
                    )}
                    {parsedDraft.postmortem.contributing_factors && parsedDraft.postmortem.contributing_factors.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>
                          Contributing Factors:
                        </span>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1f2937' }}>
                          {parsedDraft.postmortem.contributing_factors.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parsedDraft.postmortem.next_steps && parsedDraft.postmortem.next_steps.length > 0 && (
                      <div>
                        <span style={{ fontSize: '13px', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Next Steps:</span>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1f2937' }}>
                          {parsedDraft.postmortem.next_steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Validator claims */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Validator Claims ({parsedDraft?.claims.length || 0})
                </div>

                {parsedDraft?.claims && parsedDraft.claims.length > 0 ? (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {parsedDraft.claims.map(({ claim, supported, reason }) => (
                      <div
                        key={claim.id}
                        data-testid={`claim-${claim.id}`}
                        style={{
                          background: supported ? '#f8fafc' : '#fef2f2',
                          border: supported ? '1px solid #e2e8f0' : '1px solid #f87171',
                          borderRadius: '6px',
                          padding: '12px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                              [{claim.id}]
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
                              {claim.type}
                            </span>
                            {claim.evidence_ids && claim.evidence_ids.length > 0 && (
                              <span style={{ fontSize: '11px', color: '#475569' }}>
                                (cites: {claim.evidence_ids.join(', ')})
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', color: '#1e293b' }}>{claim.text}</div>
                          {!supported && reason && (
                            <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', fontWeight: 500 }}>
                              ⚠️ {reason}
                            </div>
                          )}
                        </div>

                        <div>
                          {supported ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              ✓ SUPPORTED
                            </span>
                          ) : (
                            <span
                              data-testid="unsupported-claim-badge"
                              style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              ✗ UNSUPPORTED
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No validator claims available.</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
