import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamPage from '../pages/team/TeamPage';

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleServices = {
  services: [
    {
      id: 'checkout-service',
      name: 'Checkout Service',
      owning_team_id: 'team-payments',
      tier: 'high',
    },
    {
      id: 'payment-gateway',
      name: 'Payment Gateway',
      owning_team_id: 'team-payments',
      tier: 'critical',
    },
  ],
};

const sampleIncidents = {
  incidents: [
    {
      id: 'inc-001',
      title: 'CheckoutServiceHighLatency on checkout-service',
      status: 'open',
      alert_service_id: 'checkout-service',
      service_name: 'Checkout Service',
      owning_team_id: 'team-payments',
      blast_radius: ['checkout-service', 'payment-gateway', 'bank-network'],
      root_cause_draft: JSON.stringify({
        status: 'flagged',
        draft: {
          hypothesis: {
            root_cause_service: 'bank-network',
            cascade_path: ['checkout-service', 'payment-gateway', 'bank-network'],
            summary: 'bank-network timed out after 4000ms causing payment gateway failures.',
            confidence: 'medium',
          },
          claims: [
            {
              id: 'c1',
              type: 'causal_edge',
              text: 'payment-gateway calls bank-network',
              evidence_ids: ['edge-2'],
            },
            {
              id: 'c2',
              type: 'timestamp',
              text: 'Latency degradation initiated at 15:42:00 UTC',
              evidence_ids: ['log-bn-01'],
            },
          ],
          postmortem: {
            summary: 'Checkout requests failed due to bank network timeout.',
            impact: 'Payments delayed by 2 minutes.',
            contributing_factors: ['Third-party banking gateway latency'],
            next_steps: ['Improve retry handling and circuit breaker'],
          },
        },
        validation: {
          claims: {
            c1: { supported: true },
            c2: { supported: false, reason: 'Timestamp outside 15m alert window' },
          },
        },
      }),
      created_at: '2026-11-13T10:00:00.000Z',
    },
    {
      id: 'inc-002',
      title: 'PaymentGatewayFailure on payment-gateway',
      status: 'final',
      alert_service_id: 'payment-gateway',
      service_name: 'Payment Gateway',
      owning_team_id: 'team-payments',
      blast_radius: ['payment-gateway'],
      root_cause_draft: JSON.stringify({
        status: 'ok',
        draft: {
          hypothesis: {
            root_cause_service: 'payment-gateway',
            cascade_path: ['payment-gateway'],
            summary: 'Gateway pool exhaustion.',
            confidence: 'high',
          },
          claims: [],
        },
        validation: { claims: {} },
      }),
      created_at: '2026-11-13T09:30:00.000Z',
    },
  ],
};

function renderTeamPage() {
  return render(
    <MemoryRouter>
      <TeamPage />
    </MemoryRouter>
  );
}

describe('TeamPage (/team)', () => {
  it('1. Team services render correctly', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    const checkoutCard = await screen.findByTestId('service-card-checkout-service');
    expect(checkoutCard).toHaveTextContent('Checkout Service');
    expect(checkoutCard).toHaveTextContent('high');

    const paymentCard = screen.getByTestId('service-card-payment-gateway');
    expect(paymentCard).toHaveTextContent('Payment Gateway');
    expect(paymentCard).toHaveTextContent('critical');
  });

  it('2. Team incidents render correctly', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(await screen.findByText('CheckoutServiceHighLatency on checkout-service')).toBeInTheDocument();
    expect(screen.getByText('PaymentGatewayFailure on payment-gateway')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('final')).toBeInTheDocument();
  });

  it('3. Incident selection shows details', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    // Default first incident details
    expect(await screen.findByText(/bank-network timed out after 4000ms/)).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('checkout-service ➔ payment-gateway ➔ bank-network')).toBeInTheDocument();

    // Click second incident
    const secondCard = screen.getByTestId('incident-item-inc-002');
    await userEvent.click(secondCard);

    // Shows second incident details
    expect(await screen.findByText(/Gateway pool exhaustion/)).toBeInTheDocument();
  });

  it('4. Blast radius renders', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(await screen.findByText('Blast Radius (3 services)')).toBeInTheDocument();
    // Services in blast radius are rendered
    expect(screen.getAllByText('checkout-service').length).toBeGreaterThan(0);
    expect(screen.getAllByText('payment-gateway').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bank-network').length).toBeGreaterThan(0);
  });

  it('5. Flagged drafts are clearly marked', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(await screen.findByText('⚠️ DRAFT FLAGGED')).toBeInTheDocument();
    expect(screen.getByText('✓ DRAFT OK')).toBeInTheDocument();
  });

  it('6. Unsupported claims are displayed and clearly marked', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(await screen.findByText('✗ UNSUPPORTED')).toBeInTheDocument();
    expect(screen.getByText(/Timestamp outside 15m alert window/)).toBeInTheDocument();
    expect(screen.getByText('✓ SUPPORTED')).toBeInTheDocument();
  });

  it('7. Loading state', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // Never resolves

    renderTeamPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading team dashboard...');
  });

  it('8. Empty state', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, { services: [] });
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, { incidents: [] });
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(await screen.findByText('No services owned by your team.')).toBeInTheDocument();
    expect(screen.getByText('No incidents found')).toBeInTheDocument();
  });

  it('9. Error state', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('Network connection failed')));

    renderTeamPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Network connection failed');
  });

  it('10. Team-scoping banner is displayed', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    expect(
      await screen.findByText('This dashboard shows only the services and incidents owned by your team.')
    ).toBeInTheDocument();
  });

  it('11. No editing controls are available on team dashboard', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/v1/services')) return jsonResponse(200, sampleServices);
      if (url.includes('/api/v1/incidents')) return jsonResponse(200, sampleIncidents);
      return jsonResponse(404, {});
    });

    renderTeamPage();

    await screen.findByTestId('service-card-checkout-service');

    // No inputs or textareas for editing
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // No edit or finalize buttons
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finalize/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as final/i })).not.toBeInTheDocument();
    // Read-only indicator is present
    expect(screen.getByText('🔒 Read-Only')).toBeInTheDocument();
  });
});
