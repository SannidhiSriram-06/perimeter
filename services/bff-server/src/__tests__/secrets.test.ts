import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { requireStrongSecret } from '../server';

describe('requireStrongSecret', () => {
  test('accepts a long random value', () => {
    const value = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    assert.equal(requireStrongSecret('AUTH_SECRET', value), value);
  });

  test('rejects a missing or empty value', () => {
    assert.throws(() => requireStrongSecret('AUTH_SECRET', undefined), /AUTH_SECRET is not set/);
    assert.throws(() => requireStrongSecret('AUTH_SECRET', ''), /AUTH_SECRET is not set/);
  });

  test('rejects a short value', () => {
    assert.throws(() => requireStrongSecret('WEBHOOK_SECRET', 'short-secret'), /at least 32 characters/);
  });

  test('rejects the placeholders from .env.example', () => {
    assert.throws(() => requireStrongSecret('AUTH_SECRET', 'change_me_to_a_long_random_string'), /placeholder/);
    assert.throws(() => requireStrongSecret('WEBHOOK_SECRET', 'change_me_to_another_long_random_string'), /placeholder/);
  });
});
