import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import EmptyState from '../components/EmptyState';
import AdminHome from '../pages/AdminHome';

describe('EmptyState component', () => {
  it('renders default nominal status and metrics', () => {
    render(<EmptyState />);

    // Shield status article
    const statusArticle = screen.getByRole('status', { name: 'All Systems Operational' });
    expect(statusArticle).toBeInTheDocument();

    // Title and subtitle
    expect(screen.getByRole('heading', { name: 'All Systems Operational' })).toBeInTheDocument();
    expect(
      screen.getByText(/zero active incidents or firing alerts detected across the perimeter/i)
    ).toBeInTheDocument();

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
  });

  it('renders custom metrics and text when props are provided', () => {
    render(
      <EmptyState
        title="Scoped Team Status"
        subtitle="No alerts affecting your team's assigned services."
        monitoredServices="3 / 3"
        servicesStatus="TEAM SCOPED HEALTHY"
        firingAlerts="0"
        alertsStatus="Alertmanager Scoped"
        traceCorrelation="IDLE"
        engineStatus="No Active Anomalies"
        routerOnCall="ON CALL: Alice"
        teamsCovered="Checkout & Payment"
        roleContext="Team members see their scoped services."
      >
        <button type="button">Refresh Health</button>
      </EmptyState>
    );

    expect(screen.getByRole('heading', { name: 'Scoped Team Status' })).toBeInTheDocument();
    expect(screen.getByText("No alerts affecting your team's assigned services.")).toBeInTheDocument();
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(screen.getByText('TEAM SCOPED HEALTHY')).toBeInTheDocument();
    expect(screen.getByText('ON CALL: Alice')).toBeInTheDocument();
    expect(screen.getByText('Checkout & Payment')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Team members see their scoped services.');
    expect(screen.getByRole('button', { name: 'Refresh Health' })).toBeInTheDocument();
  });
});

describe('AdminHome component', () => {
  it('renders admin heading, navigation links and empty state', () => {
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

    const incidentsLink = screen.getByRole('link', { name: /incidents/i });
    expect(incidentsLink).toHaveAttribute('href', '/admin/incidents');

    const directoryLink = screen.getByRole('link', { name: /team directory & leave/i });
    expect(directoryLink).toHaveAttribute('href', '/admin/directory');

    const evaluationLink = screen.getByRole('link', { name: /evaluation results/i });
    expect(evaluationLink).toHaveAttribute('href', '/admin/evaluation');

    // Nominal state illustration inside AdminHome
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view resolved incidents/i })).toHaveAttribute(
      'href',
      '/admin/incidents'
    );
    expect(screen.getByRole('link', { name: /run chaos scenario/i })).toHaveAttribute(
      'href',
      '/admin/evaluation'
    );
  });
});
