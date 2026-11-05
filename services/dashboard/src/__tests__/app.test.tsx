import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function signIn(id: string) {
  await userEvent.type(screen.getByLabelText('ID'), id);
  await userEvent.type(screen.getByLabelText('Password'), 'perimeter-dev');
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

it('admin login lands on the Admin area and sends id + password', async () => {
  fetchMock.mockImplementation(() => json(200, { token: 't-admin', role: 'admin' }));
  renderAt('/login');
  await signIn('10001');
  expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain('/api/v1/auth/login');
  expect(JSON.parse(init.body)).toEqual({ id: '10001', password: 'perimeter-dev' });
});

it('team member login lands on the Team area', async () => {
  fetchMock.mockImplementation(() => json(200, { token: 't-team', role: 'team_member' }));
  renderAt('/login');
  await signIn('100101');
  expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
});

it('failed login shows one generic error and stays on the login page', async () => {
  fetchMock.mockImplementation(() => json(401, { error: 'whatever the server says' }));
  renderAt('/login');
  await signIn('99999');
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  expect(screen.queryByText(/whatever the server says/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
});

it('route guard sends anonymous users to login', async () => {
  renderAt('/admin');
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
});

it('route guard sends a team member away from the Admin area', async () => {
  sessionStorage.setItem('perimeter.session', JSON.stringify({ token: 't', role: 'team_member' }));
  renderAt('/admin');
  expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
});

it('sign out clears the session and returns to login', async () => {
  sessionStorage.setItem('perimeter.session', JSON.stringify({ token: 't', role: 'admin' }));
  renderAt('/admin');
  await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument());
  expect(sessionStorage.getItem('perimeter.session')).toBeNull();
});
