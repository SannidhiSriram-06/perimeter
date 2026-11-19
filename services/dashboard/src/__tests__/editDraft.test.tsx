import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Incident } from '../api/incidents';
import EditDraftPanel from '../pages/admin/EditDraftPanel';
import ReviewPage from '../pages/admin/ReviewPage';

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, statusText: String(status), headers: { 'Content-Type': 'application/json' } }));

// The validation object has the shape the engine returns: claims is an ARRAY (src/llm/validator.py).
const modelDraft = {
  status: 'flagged',
  draft: {
    incident_id: 'x',
    hypothesis: { root_cause_service: 'bank-network', cascade_path: ['checkout-service', 'bank-network'], summary: 'bank timed out', confidence: 'medium' },
    claims: [],
    postmortem: { summary: 'Checkout failed', impact: 'HTTP 500s', timeline: [], contributing_factors: ['No timeout'], next_steps: ['Add breaker'] },
  },
  validation: {
    claims: [
      { id: 'c1', supported: true, reasons: [], rendered_text: 'payment-gateway calls bank-network' },
      { id: 'c2', supported: false, reasons: ['no trace edge a -> b'], rendered_text: 'a calls b' },
    ],
    issues: [{ rule: 'cascade_path_connected', message: 'no trace edge between checkout-service and bank-network' }],
    timeline_warnings: [0],
  },
};

const makeIncident = (over: Partial<Incident> = {}): Incident => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'CheckoutServiceHighLatency on checkout-service',
  status: 'open',
  alert_service_id: 'checkout-service',
  blast_radius: ['checkout-service', 'bank-network'],
  root_cause_draft: JSON.stringify(modelDraft),
  reviewed_draft: null,
  reviewed_by: null,
  reviewed_at: null,
  finalized_at: null,
  created_at: '2026-11-19T10:00:00Z',
  service_name: 'Checkout Service',
  owning_team_id: 'team-payments',
  ...over,
});

function Harness({ initial }: { initial: Incident }) {
  const [incident, setIncident] = useState(initial);
  return <EditDraftPanel incident={incident} onSaved={setIncident} />;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastBody = () => {
  const calls = fetchMock.mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body);
};

it('Save sends only the fields that changed', async () => {
  fetchMock.mockImplementation(() => json(200, { incident: makeIncident({ reviewed_by: '10001', reviewed_at: '2026-11-19T11:00:00Z' }) }));
  render(<Harness initial={makeIncident()} />);

  await userEvent.clear(screen.getByLabelText('Summary'));
  await userEvent.type(screen.getByLabelText('Summary'), 'new summary');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('/api/v1/incidents/11111111-1111-4111-8111-111111111111/draft');
  expect(init.method).toBe('PATCH');
  expect(lastBody()).toEqual({ hypothesis: { summary: 'new summary' } });
  expect(await screen.findByText(/last edited by 10001/i)).toBeInTheDocument();
});

it('Save is disabled until something changes', () => {
  render(<Harness initial={makeIncident()} />);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('blocks saving a cascade path with no services', async () => {
  render(<Harness initial={makeIncident()} />);
  await userEvent.clear(screen.getByLabelText(/cascade path/i));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText('Needs at least one service')).toBeInTheDocument();
});

it('Mark final asks for confirmation before sending finalize', async () => {
  fetchMock.mockImplementation(() => json(200, { incident: makeIncident({ status: 'final', finalized_at: '2026-11-19T11:00:00Z' }) }));
  render(<Harness initial={makeIncident()} />);

  await userEvent.click(screen.getByRole('button', { name: 'Mark final' }));
  expect(fetchMock).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /confirm: mark final/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(lastBody()).toEqual({ finalize: true });
  expect(await screen.findByText(/final and read-only/i)).toBeInTheDocument();
});

it('Cancel on the confirm step sends nothing', async () => {
  render(<Harness initial={makeIncident()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Mark final' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it.each([
  [400, /server rejected these values/i],
  [403, /do not have permission/i],
  [409, /already been finalized/i],
])('shows a clear message for a %i response', async (status, message) => {
  fetchMock.mockImplementation(() => json(status, { error: 'x' }));
  render(<Harness initial={makeIncident()} />);
  await userEvent.type(screen.getByLabelText('Impact'), '!');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(message)).toBeInTheDocument();
});

it('a final incident is read-only until the admin reopens it', async () => {
  render(<Harness initial={makeIncident({ status: 'final', finalized_at: '2026-11-19T11:00:00Z' })} />);
  expect(screen.getByLabelText('Summary')).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /reopen for editing/i }));
  expect(screen.getByLabelText('Summary')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it('shows unsupported claims from the validator array using rendered_text and reasons', () => {
  render(<Harness initial={makeIncident()} />);
  const flags = screen.getByRole('region', { name: 'Validator flags' });
  expect(flags).toHaveTextContent('a calls b');
  expect(flags).toHaveTextContent('no trace edge a -> b');
  expect(flags).not.toHaveTextContent('payment-gateway calls bank-network'); // the supported claim is not flagged
  expect(flags).toHaveTextContent('Timeline rows without a supported claim: 1');
  // The matching rule is also shown beside the cascade path field.
  expect(screen.getAllByText(/no trace edge between checkout-service and bank-network/).length).toBeGreaterThan(1);
});

it('starts from the reviewer edits when they exist, keeping the model draft untouched', () => {
  render(<Harness initial={makeIncident({ reviewed_draft: { hypothesis: { summary: 'edited earlier' } } })} />);
  expect(screen.getByLabelText('Summary')).toHaveValue('edited earlier');
  expect(screen.getByLabelText('Impact')).toHaveValue('HTTP 500s');
});

it('shows a placeholder when the incident has no draft', () => {
  render(<Harness initial={makeIncident({ root_cause_draft: null })} />);
  expect(screen.getByText(/no validator result/i)).toBeInTheDocument();
});

it('ReviewPage loads the incident by id from the list', async () => {
  fetchMock.mockImplementation(() => json(200, { incidents: [makeIncident()] }));
  render(
    <MemoryRouter initialEntries={['/admin/incidents/11111111-1111-4111-8111-111111111111/review']}>
      <Routes>
        <Route path="/admin/incidents/:id/review" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('heading', { name: /CheckoutServiceHighLatency/ })).toBeInTheDocument();
  expect(screen.getByLabelText('Summary')).toHaveValue('bank timed out');
});

it('ReviewPage says so when the id is unknown or loading fails', async () => {
  fetchMock.mockImplementationOnce(() => json(200, { incidents: [] }));
  const { unmount } = render(
    <MemoryRouter initialEntries={['/admin/incidents/nope/review']}>
      <Routes>
        <Route path="/admin/incidents/:id/review" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText('Incident not found.')).toBeInTheDocument();
  unmount();

  fetchMock.mockImplementationOnce(() => json(500, {}));
  render(
    <MemoryRouter initialEntries={['/admin/incidents/nope/review']}>
      <Routes>
        <Route path="/admin/incidents/:id/review" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the incident.');
});
