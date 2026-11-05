import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLen: number) => Promise<Buffer>;
const KEY_LEN = 64;

/** Hashes a password as `scrypt$<salt hex>$<key hex>`. Use it to produce the value stored in users.password_hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

const HEX = /^(?:[0-9a-f]{2})+$/i;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  // Reject non-hex or wrong-length fields: Buffer.from(bad, 'hex') silently decodes to a short or empty key.
  if (!HEX.test(saltHex) || !HEX.test(keyHex)) return false;
  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_LEN) return false;
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** A real hash nobody knows the password for, checked when the ID does not exist so timing does not reveal valid IDs. */
export const dummyHash: Promise<string> = hashPassword(randomBytes(16).toString('hex'));
