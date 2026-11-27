import React from 'react';

/** Towers standing quietly under a rising sun. */
function QuietTowers() {
  const towers: Array<[number, number]> = [[100, 70], [240, 56], [380, 40], [520, 56], [660, 70]];
  return (
    <svg className="art" viewBox="0 0 900 200" aria-hidden="true">
      <g filter="url(#rough)">
        <g fill="none" stroke="#B8380F" strokeWidth="1.8">
          <path d="M330 190 A120 120 0 0 1 570 190" />
          <path d="M300 190 A150 150 0 0 1 600 190" strokeDasharray="3 7" />
        </g>
        {towers.map(([x, y]) => (
          <use key={x} href="#tower" width="120" height="320" transform={`translate(${x} ${y}) scale(0.38)`} />
        ))}
        <rect x="0" y="191" width="900" height="9" fill="#FBF9F3" />
        <path d="M60 190 H840" stroke="#1B1A17" strokeWidth="2.4" />
      </g>
    </svg>
  );
}

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
  const metrics = [
    { label: 'MONITORED SERVICES', value: monitoredServices || undefined, status: servicesStatus },
    { label: 'FIRING ALERTS', value: firingAlerts, status: alertsStatus },
    { label: 'TRACE CORRELATION', value: traceCorrelation || undefined, status: engineStatus },
    { label: 'ROUTER & ON-CALL', value: routerOnCall || undefined, status: teamsCovered },
  ].filter((metric) => metric.value !== undefined);

  return (
    <output aria-label={title} className="empty">
      <QuietTowers />
      <h2>{title}</h2>
      <p>{subtitle}</p>

      {/* Live health metrics, rendered only when metric props are passed */}
      {metrics.length > 0 && (
        <div className="metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <span className="eyebrow">{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.status && <span className="muted">{metric.status}</span>}
            </div>
          ))}
        </div>
      )}

      {roleContext && (
        <aside role="note" className="dashed">
          <strong>Role Context:</strong> {roleContext}
        </aside>
      )}

      {children && <div className="slot">{children}</div>}
    </output>
  );
}
