import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, verifyToken } from '../auth/token';
import { validateStatusPatch } from '../teams/routes';

const SECRET = 'test-secret';

test('issued token verifies with the same secret', () => {
  const token = issueToken('10001', 'admin', SECRET);
  const claims = verifyToken(token, SECRET);
  assert.equal(claims?.sub, '10001');
  assert.equal(claims?.role, 'admin');
});

test('token signed with another secret is rejected', () => {
  const token = issueToken('10001', 'admin', 'other-secret');
  assert.equal(verifyToken(token, SECRET), null);
});

test('tampered payload is rejected', () => {
  const [, sig] = issueToken('100101', 'team_member', SECRET).split('.');
  const forgedBody = Buffer.from(JSON.stringify({ sub: '10001', role: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyToken(`${forgedBody}.${sig}`, SECRET), null);
});

test('expired token is rejected', () => {
  const issuedAt = 1_000_000;
  const token = issueToken('10001', 'admin', SECRET, issuedAt);
  assert.equal(verifyToken(token, SECRET, issuedAt + 9 * 60 * 60 * 1000), null);
});

test('malformed token is rejected', () => {
  assert.equal(verifyToken('not-a-token', SECRET), null);
});

test('status patch accepts valid input', () => {
  assert.equal(validateStatusPatch({ is_on_leave: true }), null);
  assert.equal(validateStatusPatch({ seniority: 'senior', skills: ['kubernetes', 'go-lang'] }), null);
});

test('status patch rejects bad seniority, types and skills', () => {
  assert.ok(validateStatusPatch({ seniority: 'chief' }));
  assert.ok(validateStatusPatch({ is_on_leave: 'yes' }));
  assert.ok(validateStatusPatch({ skills: 'go' }));
  assert.ok(validateStatusPatch({ skills: ['Has Spaces'] }));
  assert.ok(validateStatusPatch({ skills: Array(21).fill('go') }));
  assert.ok(validateStatusPatch(null));
});
