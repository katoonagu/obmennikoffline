import { describe, expect, it } from 'vitest';
import { readAdminActorIdHeader } from '../../src/api/adminActorId.js';

describe('readAdminActorIdHeader', () => {
  it('trims and returns a valid admin actor id', () => {
    expect(readAdminActorIdHeader(' manager-1 ', undefined)).toBe('manager-1');
  });

  it('rejects missing, ambiguous, and unsafe actor header values', () => {
    expect(() => readAdminActorIdHeader(undefined, undefined)).toThrow(
      'admin actor id is required',
    );
    expect(() =>
      readAdminActorIdHeader(['manager-1', 'manager-2'], undefined),
    ).toThrow('admin actor id is invalid');
    expect(() => readAdminActorIdHeader('bad actor', undefined)).toThrow(
      'admin actor id is invalid',
    );
  });

  it('enforces the configured admin actor allowlist', () => {
    const allowedActorIds = new Set(['manager-1']);

    expect(readAdminActorIdHeader('manager-1', allowedActorIds)).toBe(
      'manager-1',
    );
    expect(() =>
      readAdminActorIdHeader('manager-2', allowedActorIds),
    ).toThrow('admin actor id is not allowed');
  });
});
