import { describe, expect, it, vi } from 'vitest';
import { createQrCodeDataUrl } from '../../src/mini-app/qrCodeDataUrl.js';

describe('Mini App QR code generation', () => {
  it('generates a data URL for the exact SELL deposit address with stable renderer options', async () => {
    const generator = vi.fn(async () => 'data:image/png;base64,qr');

    await expect(createQrCodeDataUrl(
      ' TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY ',
      { generateDataUrl: generator },
    )).resolves.toBe('data:image/png;base64,qr');

    expect(generator).toHaveBeenCalledWith(
      'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 176,
        color: {
          dark: '#080D0Eff',
          light: '#F2F2F2ff',
        },
      },
    );
  });

  it('rejects empty QR payloads before calling the renderer', async () => {
    const generator = vi.fn(async () => 'data:image/png;base64,qr');

    await expect(createQrCodeDataUrl(' ', {
      generateDataUrl: generator,
    })).rejects.toThrow('QR payload is required');
    expect(generator).not.toHaveBeenCalled();
  });
});
