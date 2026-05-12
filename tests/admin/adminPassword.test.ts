import { describe, expect, it } from 'vitest';
import {
  hashAdminPassword,
  verifyAdminPassword,
} from '../../src/admin/adminPassword.js';

describe('admin password hashing', () => {
  it('hashes admin passwords without storing the plaintext', () => {
    const password = 'correct horse battery staple';
    const hash = hashAdminPassword(password, {
      salt: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    });

    expect(hash).toMatch(/^scrypt:v1:/);
    expect(hash).not.toContain(password);
    expect(verifyAdminPassword(password, hash)).toBe(true);
    expect(verifyAdminPassword('wrong horse battery staple', hash)).toBe(false);
  });

  it('uses a different salt for each generated hash', () => {
    const first = hashAdminPassword('correct horse battery staple');
    const second = hashAdminPassword('correct horse battery staple');

    expect(first).not.toBe(second);
    expect(verifyAdminPassword('correct horse battery staple', first)).toBe(true);
    expect(verifyAdminPassword('correct horse battery staple', second)).toBe(true);
  });

  it('rejects weak admin passwords and malformed hashes', () => {
    expect(() => hashAdminPassword('short')).toThrow(
      'admin password must be at least 12 characters',
    );
    expect(verifyAdminPassword('correct horse battery staple', 'not-a-hash')).toBe(false);
  });
});
