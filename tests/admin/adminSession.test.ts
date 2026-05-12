import { describe, expect, it } from 'vitest';
import {
  signAdminSession,
  verifyAdminSession,
} from '../../src/admin/adminSession.js';

const NOW = new Date('2026-05-12T09:00:00.000Z');
const SECRET = 'admin-session-secret-with-at-least-32-characters';

describe('admin sessions', () => {
  it('signs and verifies a short-lived admin session token', () => {
    const token = signAdminSession({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      secret: SECRET,
      now: NOW,
      ttlSeconds: 900,
    });

    expect(token).toMatch(/^admin_session_v1\./);
    expect(token).not.toContain('admin-session-secret');
    expect(
      verifyAdminSession({
        token,
        secret: SECRET,
        now: new Date('2026-05-12T09:10:00.000Z'),
      }),
    ).toEqual({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      issuedAt: '2026-05-12T09:00:00.000Z',
      expiresAt: '2026-05-12T09:15:00.000Z',
    });
  });

  it('rejects tampered, expired, and weakly signed admin session tokens', () => {
    const token = signAdminSession({
      adminId: 'admin-1',
      username: 'manager-1',
      role: 'manager',
      secret: SECRET,
      now: NOW,
      ttlSeconds: 60,
    });
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    expect(
      verifyAdminSession({
        token: tamperedToken,
        secret: SECRET,
        now: NOW,
      }),
    ).toBeNull();
    expect(
      verifyAdminSession({
        token,
        secret: SECRET,
        now: new Date('2026-05-12T09:02:00.000Z'),
      }),
    ).toBeNull();
    expect(() =>
      signAdminSession({
        adminId: 'admin-1',
        username: 'manager-1',
        role: 'manager',
        secret: 'short',
        now: NOW,
      }),
    ).toThrow('admin session secret must be at least 32 characters');
  });
});
