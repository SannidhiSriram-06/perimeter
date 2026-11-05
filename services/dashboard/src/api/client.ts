export type Role = 'admin' | 'team_member';

export interface LoginResponse {
  token: string;
  role: Role;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

/** Called once by the auth provider so the client can attach the token and react to 401. */
export function configureApi(opts: { getToken: () => string | null; onUnauthorized: () => void }): void {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

/**
 * Typed fetch wrapper. Attaches the Bearer token when there is one.
 * A 401 on an authenticated call clears the session (via onUnauthorized).
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return (await res.json()) as T;
}

export function login(id: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ id, password }),
  });
}
