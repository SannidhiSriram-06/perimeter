import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const renderAt = (path: string, role?: 'admin' | 'team_member') => {
  if (role) sessionStorage.setItem('perimeter.session', JSON.stringify({ token: 't', role }));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
};

afterEach(() => vi.unstubAllGlobals());

it('serves a public landing page that does not claim automatic paging', () => {
  renderAt('/');
  expect(screen.getByRole('heading', { level: 1, name: /watching every edge/i })).toBeInTheDocument();
  expect(screen.getByText(/nobody is paged automatically/i)).toBeInTheDocument();
});

it('shows each service with its state taken from open incidents', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.endsWith('/api/v1/services')) {
      return json({ services: [
        { id: 'checkout-service', name: 'Checkout', owning_team_id: 'team-payments', tier: 'high' },
        { id: 'recommendation-engine', name: 'Recs', owning_team_id: 'team-core', tier: 'low' },
      ] });
    }
    if (url.endsWith('/api/v1/incidents')) {
      return json({ incidents: [{ id: 'i1', status: 'open', finalized_at: null, alert_service_id: 'checkout-service', blast_radius: ['checkout-service'], root_cause_draft: null, reviewed_draft: null }] });
    }
    return json({ teams: [{ id: 'team-payments', name: 'Payments', description: null }] });
  }));
  renderAt('/admin/services', 'admin');
  expect(await screen.findByRole('cell', { name: 'Alerted' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'No open incident' })).toBeInTheDocument();
});

it('lists the rota for a team member and says nobody is paged', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    url.endsWith('/members')
      ? json({ members: [{ user_id: '100101', name: 'Dev Dave', seniority: 'mid', skills: [], on_call_status: true, is_on_leave: true }] })
      : json({ teams: [{ id: 'team-payments', name: 'Payments', description: null }] }),
  ));
  renderAt('/team/on-call', 'team_member');
  expect(await screen.findByText('Dev Dave')).toBeInTheDocument();
  expect(screen.getByText('On leave')).toBeInTheDocument();
  expect(screen.getByText(/does not page anyone yet/i)).toBeInTheDocument();
});
