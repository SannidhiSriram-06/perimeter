import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DirectoryPage from '../pages/admin/DirectoryPage';
import AdminHome from '../pages/AdminHome';

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

const mockTeams = {
  teams: [
    { id: 'team-payments', name: 'Payments', description: 'Handles payments' },
    { id: 'team-core-platform', name: 'Core Platform', description: 'Maintains platform' },
  ],
};

const mockPaymentsMembers = {
  members: [
    {
      user_id: '100101',
      name: 'Dev Dave',
      seniority: 'mid',
      skills: ['python', 'postgresql', 'fastapi'],
      on_call_status: true,
      is_on_leave: false,
    },
    {
      user_id: '100102',
      name: 'Sara Senior',
      seniority: 'lead',
      skills: ['go', 'distributed-systems', 'payments'],
      on_call_status: false,
      is_on_leave: false,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads and displays teams and members without displaying Telegram chat IDs', async () => {
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith('/api/v1/teams')) return jsonResponse(200, mockTeams);
    if (url.includes('/api/v1/teams/team-payments/members')) return jsonResponse(200, mockPaymentsMembers);
    return jsonResponse(404, {});
  });

  render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>
  );

  // Check title
  expect(screen.getByText('Team Directory & Leave Management')).toBeInTheDocument();

  // Wait for teams and members to render
  await waitFor(() => {
    expect(screen.getByText('Dev Dave')).toBeInTheDocument();
  });

  expect(screen.getByText('100101')).toBeInTheDocument();
  expect(screen.getByText('Sara Senior')).toBeInTheDocument();
  expect(screen.getByText('100102')).toBeInTheDocument();

  // Verify skills are rendered
  expect(screen.getByText('fastapi')).toBeInTheDocument();
  expect(screen.getByText('distributed-systems')).toBeInTheDocument();

  // Telegram chat IDs must NEVER be rendered in DOM
  expect(screen.queryByText(/chat_101/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/chat_102/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/telegram/i)).not.toBeInTheDocument();
});

it('toggles on-call status directly and sends team_id', async () => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/teams')) return jsonResponse(200, mockTeams);
    if (url.includes('/api/v1/teams/team-payments/members')) return jsonResponse(200, mockPaymentsMembers);
    if (url.includes('/api/v1/members/100101/status') && init?.method === 'PATCH') {
      const parsedBody = JSON.parse(String(init.body));
      expect(parsedBody.team_id).toBe('team-payments');
      expect(parsedBody.on_call_status).toBe(false);
      return jsonResponse(200, {
        member: {
          user_id: '100101',
          team_id: 'team-payments',
          seniority: 'mid',
          skills: ['python', 'postgresql', 'fastapi'],
          on_call_status: false,
          is_on_leave: false,
        },
      });
    }
    return jsonResponse(404, {});
  });

  render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Dev Dave')).toBeInTheDocument();
  });

  const onCallButton = screen.getByRole('checkbox', { name: /Toggle on-call for Dev Dave/i });
  expect(onCallButton).toBeChecked();

  fireEvent.click(onCallButton);

  await waitFor(() => {
    expect(screen.getByText(/Updated status for user 100101/i)).toBeInTheDocument();
  });
  expect(onCallButton).not.toBeChecked();
});

it('requires confirmation before marking someone on leave', async () => {
  let patchCalled = false;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/teams')) return jsonResponse(200, mockTeams);
    if (url.includes('/api/v1/teams/team-payments/members')) return jsonResponse(200, mockPaymentsMembers);
    if (url.includes('/api/v1/members/100101/status') && init?.method === 'PATCH') {
      patchCalled = true;
      const parsedBody = JSON.parse(String(init.body));
      expect(parsedBody.is_on_leave).toBe(true);
      expect(parsedBody.team_id).toBe('team-payments');
      return jsonResponse(200, {
        member: {
          user_id: '100101',
          team_id: 'team-payments',
          seniority: 'mid',
          skills: ['python', 'postgresql', 'fastapi'],
          on_call_status: true,
          is_on_leave: true,
        },
      });
    }
    return jsonResponse(404, {});
  });

  render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Dev Dave')).toBeInTheDocument();
  });

  const leaveButton = screen.getByRole('checkbox', { name: /Toggle leave for Dev Dave/i });
  expect(leaveButton).not.toBeChecked();

  // Click to toggle leave
  fireEvent.click(leaveButton);

  // Confirmation dialog should be visible
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/Confirm Leave Marking/i)).toBeInTheDocument();
  expect(patchCalled).toBe(false);

  // Click Cancel
  fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(patchCalled).toBe(false);

  // Click again and Confirm
  fireEvent.click(leaveButton);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Confirm Leave/i }));

  await waitFor(() => {
    expect(patchCalled).toBe(true);
    expect(screen.getByText(/Updated status for user 100101/i)).toBeInTheDocument();
  });
  expect(leaveButton).toBeChecked();
});

it('edits seniority and skills for a member', async () => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/teams')) return jsonResponse(200, mockTeams);
    if (url.includes('/api/v1/teams/team-payments/members')) return jsonResponse(200, mockPaymentsMembers);
    if (url.includes('/api/v1/members/100101/status') && init?.method === 'PATCH') {
      const parsedBody = JSON.parse(String(init.body));
      expect(parsedBody.seniority).toBe('senior');
      expect(parsedBody.skills).toEqual(['python', 'docker']);
      expect(parsedBody.team_id).toBe('team-payments');
      return jsonResponse(200, {
        member: {
          user_id: '100101',
          team_id: 'team-payments',
          seniority: 'senior',
          skills: ['python', 'docker'],
          on_call_status: true,
          is_on_leave: false,
        },
      });
    }
    return jsonResponse(404, {});
  });

  render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Dev Dave')).toBeInTheDocument();
  });

  // Click Edit button for Dev Dave
  const editButtons = screen.getAllByRole('button', { name: 'Edit' });
  fireEvent.click(editButtons[0]);

  expect(screen.getByText(/Edit Member: Dev Dave/i)).toBeInTheDocument();

  // Change seniority
  const select = screen.getByRole('combobox');
  fireEvent.change(select, { target: { value: 'senior' } });

  // Change skills
  const skillsInput = screen.getByRole('textbox', { name: /skills/i });
  fireEvent.change(skillsInput, { target: { value: 'python, docker' } });

  // Save changes
  fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

  await waitFor(() => {
    expect(screen.getByText('docker')).toBeInTheDocument();
  });
});

it('shows 409 conflict message when team_id is ambiguous or rejected', async () => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/api/v1/teams')) return jsonResponse(200, mockTeams);
    if (url.includes('/api/v1/teams/team-payments/members')) return jsonResponse(200, mockPaymentsMembers);
    if (url.includes('/api/v1/members/100101/status') && init?.method === 'PATCH') {
      return jsonResponse(409, {
        error: 'Conflict',
        message: 'user belongs to several teams: pass team_id',
      });
    }
    return jsonResponse(404, {});
  });

  render(
    <MemoryRouter>
      <DirectoryPage />
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByText('Dev Dave')).toBeInTheDocument();
  });

  const onCallButton = screen.getByRole('checkbox', { name: /Toggle on-call for Dev Dave/i });
  fireEvent.click(onCallButton);

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  expect(screen.getByText(/Conflict \(409\): user belongs to several teams: pass team_id/i)).toBeInTheDocument();
});

it('renders Directory link in AdminHome navigation', () => {
  render(
    <MemoryRouter>
      <AdminHome />
    </MemoryRouter>
  );

  const link = screen.getByRole('link', { name: /Team Directory & Leave/i });
  expect(link).toHaveAttribute('href', '/admin/directory');
});
