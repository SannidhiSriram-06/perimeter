import React from 'react';

export interface EmptyStateProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly monitoredServices?: string;
  readonly servicesStatus?: string;
  readonly firingAlerts?: number | string;
  readonly alertsStatus?: string;
  readonly traceCorrelation?: string;
  readonly engineStatus?: string;
  readonly routerOnCall?: string;
  readonly teamsCovered?: string;
  readonly roleContext?: string;
  readonly children?: React.ReactNode;
}

/**
 * Reusable nominal / zero-incident empty state component.
 * Implements the design from docs/wireframes/empty-state-view.svg.
 * When telemetry metrics are supplied as props, displays the health metrics grid;
 * otherwise displays a clean zero-incident empty state banner.
 */
export default function EmptyState({
  title = 'No Active Incidents',
  subtitle = 'Zero active incidents or firing alerts detected across the perimeter.',
  monitoredServices,
  servicesStatus,
  firingAlerts,
  alertsStatus,
  traceCorrelation,
  engineStatus,
  routerOnCall,
  teamsCovered,
  roleContext,
  children,
}: Readonly<EmptyStateProps>) {
  const showMetrics = Boolean(
    monitoredServices || firingAlerts !== undefined || traceCorrelation || routerOnCall
  );

  return (
    <output
      aria-label={title}
      style={{
        display: 'block',
        background: '#1e293b',
        color: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #334155',
        padding: '32px 24px',
        textAlign: 'center',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Healthy Shield Graphic */}
      <div
        style={{
          width: '72px',
          height: '72px',
          margin: '0 auto 16px auto',
          borderRadius: '50%',
          background: '#064e3b',
          border: '2px solid #10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4ade80"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <h2 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: 700, color: '#f8fafc' }}>
        {title}
      </h2>
      <p style={{ margin: showMetrics ? '0 0 24px 0' : '0 0 16px 0', color: '#94a3b8', fontSize: '14px' }}>
        {subtitle}
      </p>

      {/* Live Health Metrics Grid (rendered only when metric props are passed) */}
      {showMetrics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* Monitored Services */}
          {monitoredServices && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                MONITORED SERVICES
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                {monitoredServices}
              </div>
              {servicesStatus && (
                <div style={{ fontSize: '10px', color: '#4ade80', fontWeight: 700 }}>
                  {servicesStatus}
                </div>
              )}
            </div>
          )}

          {/* Firing Alerts */}
          {firingAlerts !== undefined && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                FIRING ALERTS
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', marginBottom: '4px' }}>
                {firingAlerts}
              </div>
              {alertsStatus && (
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {alertsStatus}
                </div>
              )}
            </div>
          )}

          {/* Trace Correlation */}
          {traceCorrelation && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                TRACE CORRELATION
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                {traceCorrelation}
              </div>
              {engineStatus && (
                <div style={{ fontSize: '10px', color: '#4ade80', fontWeight: 700 }}>
                  {engineStatus}
                </div>
              )}
            </div>
          )}

          {/* Router & On-Call */}
          {routerOnCall && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '6px' }}>
                ROUTER & ON-CALL
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                {routerOnCall}
              </div>
              {teamsCovered && (
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                  {teamsCovered}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Role Context Pill */}
      {roleContext && (
        <aside
          role="note"
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: children ? '20px' : '0',
            fontSize: '12px',
            color: '#cbd5e1',
            textAlign: 'left',
          }}
        >
          <span style={{ marginRight: '6px' }}>💡</span>
          <strong>Role Context:</strong> {roleContext}
        </aside>
      )}

      {/* Action Controls Slot */}
      {children && <div style={{ marginTop: '16px' }}>{children}</div>}
    </output>
  );
}
