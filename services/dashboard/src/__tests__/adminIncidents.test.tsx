import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import IncidentsPage from '../pages/admin/IncidentsPage';
import IncidentDetail from '../pages/admin/IncidentDetail';
import type { Incident } from '../api/incidents';

const incident = (overrides: Partial<Incident> = {}): Incident => ({
  id: 'incident-1',
  title: 'Checkout latency',
  status: 'open',
  alert_service_id: 'checkout-service',
  blast_radius: ['checkout-service', 'payment-gateway'],
  root_cause_draft: JSON.stringify({
    status: 'flagged',
    draft: {
      hypothesis: {
        summary: 'The payment gateway timed out.',
        root_cause_service: 'payment-gateway',
        cascade_path: ['checkout-service', 'payment-gateway'],
        confidence: 'medium',
      },
      claims: [
        {
          id: 'claim-1',
          text: 'UNTRUSTED MODEL CLAIM TEXT',
          evidence_ids: ['span-17', 'log-22'],
        },
      ],
      postmortem: {
        summary: 'Checkout requests failed while the gateway timed out.',
        impact: 'Payments were delayed.',
        contributing_factors: ['Gateway timeout'],
        next_steps: ['Tune retries'],
      },
    },
    validation: {
      claims: [
        {
          id: 'claim-1',
          supported: false,
          reasons: ['Evidence is incomplete'],
          rendered_text: 'Validated claim text from the validator.',
        },
      ],
      issues: [{ rule: 'evidence', message: 'Review the cited evidence.' }],
      timeline_warnings: [],
    },
  }),
  reviewed_draft: null,
  reviewed_by: null,
  reviewed_at: null,
  finalized_at: null,
  created_at: '2026-11-19T10:00:00.000Z',
  service_name: 'Checkout Service',
  owning_team_id: 'team-payments',
  ...overrides,
});

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/incidents" element={<IncidentsPage />} />
        <Route path="/admin/incidents/:id" element={<IncidentDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('admin incident pages', () => {
  it('lists incidents with ok, flagged, and no-draft badges', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(200, {
        incidents: [
          incident(),
          incident({
            id: 'incident-2',
            title: 'Gateway recovery',
            root_cause_draft: JSON.stringify({
              status: 'ok',
              draft: { hypothesis: { summary: 'Gateway restarted.' } },
              validation: { claims: [], issues: [], timeline_warnings: [] },
            }),
          }),
          incident({
            id: 'incident-3',
            title: 'No draft incident',
            root_cause_draft: null,
          }),
        ],
      }),
    );

    renderPage('/admin/incidents');

    expect(await screen.findByRole('link', { name: 'Checkout latency' })).toHaveAttribute(
      'href',
      '/admin/incidents/incident-1',
    );
    expect(screen.getByText('Flagged for review')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('No draft')).toBeInTheDocument();
  });

  it('shows incident details using validator text, cited evidence, and a flagged banner', async () => {
    fetchMock.mockImplementation(() => jsonResponse(200, { incidents: [incident()] }));

    renderPage('/admin/incidents/incident-1');

    expect(await screen.findByRole('heading', { name: 'Checkout latency' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This draft is flagged');
    expect(screen.getByText('checkout-service')).toBeInTheDocument();
    expect(screen.getByText('The payment gateway timed out.')).toBeInTheDocument();
    expect(screen.getByText('Validated claim text from the validator.')).toBeInTheDocument();
    expect(screen.getByText('Evidence: span-17, log-22')).toBeInTheDocument();
    expect(screen.getByText('Checkout requests failed while the gateway timed out.')).toBeInTheDocument();
    expect(screen.getByText('Review the cited evidence.')).toBeInTheDocument();
    expect(screen.queryByText('UNTRUSTED MODEL CLAIM TEXT')).not.toBeInTheDocument();
    expect(screen.getByTestId('incident-actions-slot')).toBeInTheDocument();
  });

  it('shows a clear no-draft state on the detail page', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(200, {
        incidents: [incident({ root_cause_draft: null, blast_radius: [] })],
      }),
    );

    renderPage('/admin/incidents/incident-1');

    expect(await screen.findByText('No draft is available for this incident.')).toBeInTheDocument();
    expect(screen.getByText('No blast radius recorded.')).toBeInTheDocument();
  });

  it('shows an error when the detail page cannot load incidents', async () => {
    fetchMock.mockRejectedValue(new Error('request failed'));

    renderPage('/admin/incidents/incident-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the incident.');
  });

  it('shows a list error and handles a missing incident', async () => {
    fetchMock.mockRejectedValue(new Error('request failed'));
    renderPage('/admin/incidents');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load incidents.');

    fetchMock.mockImplementation(() => jsonResponse(200, { incidents: [] }));
    renderPage('/admin/incidents/missing');
    expect(await screen.findByText('Incident not found.')).toBeInTheDocument();
  });

  it('mounts the incidents list through the admin route', async () => {
    sessionStorage.setItem('perimeter.session', JSON.stringify({ token: 't', role: 'admin' }));
    fetchMock.mockImplementation(() => jsonResponse(200, { incidents: [] }));

    render(
      <MemoryRouter initialEntries={['/admin/incidents']}>
        <AuthProvider><App /></AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Incidents' })).toBeInTheDocument();
  });

  it('mounts incident details through the admin route', async () => {
    sessionStorage.setItem('perimeter.session', JSON.stringify({ token: 't', role: 'admin' }));
    fetchMock.mockImplementation(() => jsonResponse(200, { incidents: [incident()] }));

    render(
      <MemoryRouter initialEntries={['/admin/incidents/incident-1']}>
        <AuthProvider><App /></AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Checkout latency' })).toBeInTheDocument();
  });
});
