import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import EmptyState from '../components/EmptyState';
import AdminHome from '../pages/AdminHome';

describe('EmptyState component', () => {
  it('renders clean zero-incident empty state without fake metrics when metrics props are omitted', () => {
    render(<EmptyState />);

    // Output status article
    const statusOutput = screen.getByRole('status', { name: 'No Active Incidents' });
    expect(statusOutput).toBeInTheDocument();

    // Title and subtitle
    expect(screen.getByRole('heading', { name: 'No Active Incidents' })).toBeInTheDocument();
    expect(
      screen.getByText(/zero active incidents or firing alerts detected across the perimeter/i)
    ).toBeInTheDocument();

    // Metrics grid is NOT rendered when telemetry props are not provided
    expect(screen.queryByText('MONITORED SERVICES')).not.toBeInTheDocument();
    expect(screen.queryByText('FIRING ALERTS')).not.toBeInTheDocument();
    expect(screen.queryByText('TRACE CORRELATION')).not.toBeInTheDocument();
    expect(screen.queryByText('ROUTER & ON-CALL')).not.toBeInTheDocument();
  });

  it('renders metrics grid and role context when props are provided', () => {
    render(
      <EmptyState
        title="All Systems Operational"
        subtitle="Zero active incidents or firing alerts detected across the perimeter."
        monitoredServices="6 / 6"
        servicesStatus="100% HEALTHY"
        firingAlerts="0"
        alertsStatus="Prometheus Alertmanager"
        traceCorrelation="IDLE"
        engineStatus="Engine Standby"
        routerOnCall="READY"
        teamsCovered="2 Teams Covered"
        roleContext="Admins see system-wide health (6 services); Team members see their scoped services."
      >
        <button type="button">Refresh Health</button>
      </EmptyState>
    );

    // Title & Subtitle
    expect(screen.getByRole('heading', { name: 'All Systems Operational' })).toBeInTheDocument();

    // 4 Live Health Metrics Grid
    expect(screen.getByText('MONITORED SERVICES')).toBeInTheDocument();
    expect(screen.getByText('6 / 6')).toBeInTheDocument();
    expect(screen.getByText('100% HEALTHY')).toBeInTheDocument();

    expect(screen.getByText('FIRING ALERTS')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Prometheus Alertmanager')).toBeInTheDocument();

    expect(screen.getByText('TRACE CORRELATION')).toBeInTheDocument();
    expect(screen.getByText('IDLE')).toBeInTheDocument();
    expect(screen.getByText('Engine Standby')).toBeInTheDocument();

    expect(screen.getByText('ROUTER & ON-CALL')).toBeInTheDocument();
    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getByText('2 Teams Covered')).toBeInTheDocument();

    // Role context
    expect(screen.getByRole('note')).toHaveTextContent(
      'Admins see system-wide health (6 services); Team members see their scoped services.'
    );
    expect(screen.getByRole('button', { name: 'Refresh Health' })).toBeInTheDocument();
  });
});

describe('AdminHome component', () => {
  it('renders admin heading, navigation links and zero-incident empty state', () => {
    render(
      <MemoryRouter>
        <AdminHome />
      </MemoryRouter>
    );

    // Header
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(
      screen.getByText(/perimeter system status, incident triage, and administrative controls/i)
    ).toBeInTheDocument();

    // Admin Navigation Bar
    const nav = screen.getByRole('navigation', { name: 'Admin Navigation' });
    expect(nav).toBeInTheDocument();

    const incidentsLink = within(nav).getByRole('link', { name: /incidents/i });
    expect(incidentsLink).toHaveAttribute('href', '/admin/incidents');

    const directoryLink = within(nav).getByRole('link', { name: /team directory & leave/i });
    expect(directoryLink).toHaveAttribute('href', '/admin/directory');

    const evaluationLink = within(nav).getByRole('link', { name: /evaluation results/i });
    expect(evaluationLink).toHaveAttribute('href', '/admin/evaluation');

    // Nominal state illustration inside AdminHome
    expect(screen.getByText('No Active Incidents')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view incidents/i })).toHaveAttribute(
      'href',
      '/admin/incidents'
    );
    expect(screen.getByRole('link', { name: /view evaluation results/i })).toHaveAttribute(
      'href',
      '/admin/evaluation'
    );
  });
});
