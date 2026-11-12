import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EvaluationPage from '../pages/admin/EvaluationPage';
import AdminHome from '../pages/AdminHome';

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

it('renders evaluation runs with dry-run badge and notice banner', async () => {
  const sampleData = {
    runs: [
      {
        source: 'chaos_run_dryrun_summary.json',
        run_at: '2026-11-02T08:46:26.000Z',
        environment: 'controlled_test_environment',
        dry_run: true,
        notice: 'Results strictly generated within a controlled synthetic test environment',
        total: 4,
        passed: 4,
        pass_rate: 1.0,
        results: [
          {
            scenario_id: 'chaos-sc-01-payment-gateway-upstream',
            injected_fault: {
              fault_type: 'PodChaos',
              action: 'pod-kill',
              target_service: 'payment-gateway',
            },
            origin_service: 'payment-gateway',
            expected_services: ['payment-gateway', 'checkout-service', 'frontend-proxy'],
            found_services: ['payment-gateway', 'checkout-service', 'frontend-proxy'],
            precision: 1.0,
            recall: 1.0,
            false_positives: [],
            excluded_violations: [],
            passed: true,
          },
        ],
      },
    ],
  };

  fetchMock.mockImplementation(() => jsonResponse(200, sampleData));

  render(
    <MemoryRouter initialEntries={['/admin/evaluation']}>
      <Routes>
        <Route path="/admin/evaluation" element={<EvaluationPage />} />
      </Routes>
    </MemoryRouter>
  );

  // Check header
  expect(
    await screen.findByRole('heading', { name: /evaluation results & accuracy benchmark/i })
  ).toBeInTheDocument();

  // Check run source
  expect(screen.getByText('chaos_run_dryrun_summary.json')).toBeInTheDocument();

  // Check dry-run badge
  expect(
    screen.getByText('Dry run: mock data, not an accuracy result')
  ).toBeInTheDocument();

  // Check prominent notice banner
  expect(screen.getByRole('note')).toHaveTextContent(
    'Results strictly generated within a controlled synthetic test environment'
  );

  // Check scenario table contents
  expect(screen.getByText('PodChaos (pod-kill)')).toBeInTheDocument();
  expect(screen.getByText('payment-gateway')).toBeInTheDocument();
  expect(screen.getByText('Passed')).toBeInTheDocument();
});

it('displays error alert when API call fails', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'application/json' },
      })
    )
  );

  render(
    <MemoryRouter initialEntries={['/admin/evaluation']}>
      <Routes>
        <Route path="/admin/evaluation" element={<EvaluationPage />} />
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('Internal Server Error');
});

it('displays empty state when no runs exist', async () => {
  fetchMock.mockImplementation(() => jsonResponse(200, { runs: [] }));

  render(
    <MemoryRouter initialEntries={['/admin/evaluation']}>
      <Routes>
        <Route path="/admin/evaluation" element={<EvaluationPage />} />
      </Routes>
    </MemoryRouter>
  );

  expect(
    await screen.findByText(/no evaluation runs found in benchmark results directory/i)
  ).toBeInTheDocument();
});

it('AdminHome contains link to /admin/evaluation', () => {
  render(
    <MemoryRouter>
      <AdminHome />
    </MemoryRouter>
  );

  const link = screen.getByRole('link', { name: /evaluation results/i });
  expect(link).toHaveAttribute('href', '/admin/evaluation');
});
