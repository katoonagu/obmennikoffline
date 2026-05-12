import { describe, expect, it, vi } from 'vitest';
import { loadEnvFileIfPresent } from '../../src/api/envFile.js';

describe('loadEnvFileIfPresent', () => {
  it('loads .env before API config when the file exists', () => {
    const loadEnvFile = vi.fn();

    expect(
      loadEnvFileIfPresent({
        envFilePath: '.env',
        exists: () => true,
        loadEnvFile,
      }),
    ).toBe(true);

    expect(loadEnvFile).toHaveBeenCalledWith('.env');
  });

  it('does not fail when .env is absent', () => {
    const loadEnvFile = vi.fn();

    expect(
      loadEnvFileIfPresent({
        envFilePath: '.env',
        exists: () => false,
        loadEnvFile,
      }),
    ).toBe(false);

    expect(loadEnvFile).not.toHaveBeenCalled();
  });
});
