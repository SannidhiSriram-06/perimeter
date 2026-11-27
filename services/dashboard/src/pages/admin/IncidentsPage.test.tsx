import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IncidentsPage from './IncidentsPage';
import IncidentDetail from './IncidentDetail';
import * as api from '../../api/incidents';

vi.mock('../../api/incidents', async () => {
  const actual = await vi.importActual('../../api/incidents');
  return {
    ...actual,
    fetchIncidents: vi.fn(),
  };
});

const sampleIncident: api.Incident = {
  id: 'inc-123',
  title: 'Payment Timeout Spike',
  status: 'investigating',
  alert_service_id: 'checkout-service',
  blast_radius: ['checkout-service', 'payment-gateway'],
  root_cause_draft: JSON.stringify({
    status: 'ok',
    draft: {
      hypothesis: {
        root_cause_service: 'payment-gateway',
        cascade_path: ['checkout-service', 'payment-gateway'],
        summary: 'Database connection pool exhaustion on payment-gateway',
        confidence: 'high',
      },
      claims: [{ id: 'c1', type: 'latency', evidence_ids: ['span-001'] }],
      postmortem: {
        summary: 'Payment gateway degraded',
        impact: '15% error rate',
        contributing_factors: ['Connection pool limit reached'],
        next_steps: ['Increase pool size'],
      },
    },
    validation: {
      claims: [
        {
          id: 'c1',
          supported: true,
          reasons: [],
          rendered_text: 'payment-gateway P95 latency increased to 4200ms',
        },
      ],
      issues: [],
      timeline_warnings: [],
    },
  }),
  reviewed_draft: null,
  reviewed_by: null,
  reviewed_at: null,
  finalized_at: null,
  created_at: '2026-11-25T10:00:00Z',
  service_name: 'checkout-service',
  owning_team_id: 'team-payments',
};

describe('Admin Incidents Pages', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('IncidentsPage renders incident row and Draft OK badge', async () => {
    vi.mocked(api.fetchIncidents).mockResolvedValueOnce({
      incidents: [sampleIncident],
    });

    render(
      <MemoryRouter>
        <IncidentsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Payment Timeout Spike')).toBeInTheDocument();
    });
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  test('IncidentDetail renders blast radius, hypothesis, claims and postmortem', async () => {
    vi.mocked(api.fetchIncidents).mockResolvedValueOnce({
      incidents: [sampleIncident],
    });

    render(
      <MemoryRouter initialEntries={['/admin/incidents/inc-123']}>
        <Routes>
          <Route path="/admin/incidents/:id" element={<IncidentDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Payment Timeout Spike' })).toBeInTheDocument();
    });

    expect(screen.getByText('checkout-service')).toBeInTheDocument();
    expect(screen.getByText('payment-gateway')).toBeInTheDocument();
    expect(screen.getByText(/Database connection pool exhaustion/i)).toBeInTheDocument();
    expect(screen.getByText('payment-gateway P95 latency increased to 4200ms')).toBeInTheDocument();
    expect(screen.getByText(/span-001/i)).toBeInTheDocument();
    expect(screen.getByText('Payment gateway degraded')).toBeInTheDocument();
  });

  test('IncidentDetail handles flagged draft banner', async () => {
    const flaggedIncident: api.Incident = {
      ...sampleIncident,
      id: 'inc-flagged',
      root_cause_draft: JSON.stringify({
        status: 'flagged',
        draft: { hypothesis: { summary: 'Suspect network issue' } },
        validation: {
          claims: [{ id: 'c2', supported: false, reasons: ['No matching span'], rendered_text: 'Unverified claim' }],
          issues: [{ rule: 'unsupported_claim', message: 'Claim has no backing evidence' }],
          timeline_warnings: [],
        },
      }),
    };

    vi.mocked(api.fetchIncidents).mockResolvedValueOnce({
      incidents: [flaggedIncident],
    });

    render(
      <MemoryRouter initialEntries={['/admin/incidents/inc-flagged']}>
        <Routes>
          <Route path="/admin/incidents/:id" element={<IncidentDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/This draft is flagged/i)).toBeInTheDocument();
    expect(screen.getByText('Unverified claim')).toBeInTheDocument();
  });
});
