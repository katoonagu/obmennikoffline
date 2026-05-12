import * as QRCode from 'qrcode';
import type { QRCodeToDataURLOptions } from 'qrcode';

const DEFAULT_QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 1,
  width: 176,
  color: {
    dark: '#080D0Eff',
    light: '#F2F2F2ff',
  },
} as const satisfies QRCodeToDataURLOptions;

export type QrCodeDataUrlGenerator = (
  text: string,
  options: QRCodeToDataURLOptions,
) => Promise<string>;

export async function createQrCodeDataUrl(
  payload: string,
  input: {
    generateDataUrl?: QrCodeDataUrlGenerator;
  } = {},
): Promise<string> {
  const text = payload.trim();

  if (!text) {
    throw new Error('QR payload is required');
  }

  const generateDataUrl =
    input.generateDataUrl ??
    ((value: string, options: QRCodeToDataURLOptions) =>
      QRCode.toDataURL(value, options));

  return generateDataUrl(text, DEFAULT_QR_OPTIONS);
}
