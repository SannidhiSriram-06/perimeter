import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../auth/password';

test('correct password verifies, wrong one does not', async () => {
  const stored = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', stored), true);
  assert.equal(await verifyPassword('wrong horse', stored), false);
});

test('same password hashes differently each time (random salt)', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('malformed stored hash never verifies', async () => {
  for (const bad of ['', 'plaintext', 'bcrypt$x$y', 'scrypt$onlysalt']) {
    assert.equal(await verifyPassword('anything', bad), false);
  }
});
