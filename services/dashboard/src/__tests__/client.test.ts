import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, api, configureApi } from '../api/client';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('attaches the Bearer token', async () => {
  configureApi({ getToken: () => 'abc', onUnauthorized: () => {} });
  fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  await api('/api/v1/incidents');
  expect((fetchMock.mock.calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer abc');
});

it('calls onUnauthorized on 401 with a token and throws ApiError', async () => {
  const onUnauthorized = vi.fn();
  configureApi({ getToken: () => 'abc', onUnauthorized });
  fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
  await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  expect(onUnauthorized).toHaveBeenCalledOnce();
});
