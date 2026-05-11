import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateTelegramInitData } from '../../src/telegram/validateInitData.js';

const BOT_TOKEN = '123456:test_bot_token';
const NOW = new Date('2026-05-11T09:00:00.000Z');

function createInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const dataCheckString = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

describe('validateTelegramInitData', () => {
  it('validates signed Mini App initData and parses the Telegram user', () => {
    const initData = createInitData({
      auth_date: '1778490000',
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify({
        id: 462656683,
        first_name: 'Pavel',
        last_name: 'Astrahanov',
        username: 'pavel',
        language_code: 'ru',
      }),
    });

    expect(
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        now: NOW,
      }),
    ).toEqual({
      authDate: new Date('2026-05-11T09:00:00.000Z'),
      queryId: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: {
        id: 462656683,
        first_name: 'Pavel',
        last_name: 'Astrahanov',
        username: 'pavel',
        language_code: 'ru',
        is_premium: undefined,
      },
    });
  });

  it('rejects tampered initData', () => {
    const initData = createInitData({
      auth_date: '1778490000',
      user: JSON.stringify({ id: 462656683 }),
    }).replace('462656683', '462656684');

    expect(() =>
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        now: NOW,
      }),
    ).toThrow('initData signature is invalid');
  });

  it('rejects missing hashes', () => {
    expect(() =>
      validateTelegramInitData({
        initData: new URLSearchParams({ auth_date: '1778490000' }).toString(),
        botToken: BOT_TOKEN,
        now: NOW,
      }),
    ).toThrow('initData hash is required');
  });

  it('rejects expired initData', () => {
    const initData = createInitData({
      auth_date: '1778400000',
      user: JSON.stringify({ id: 462656683 }),
    });

    expect(() =>
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        now: NOW,
        maxAgeSeconds: 60,
      }),
    ).toThrow('initData is expired');
  });

  it('rejects auth_date values from the future', () => {
    const initData = createInitData({
      auth_date: '1778490121',
      user: JSON.stringify({ id: 462656683 }),
    });

    expect(() =>
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        now: NOW,
      }),
    ).toThrow('auth_date is from the future');
  });

  it('rejects malformed Telegram users', () => {
    const initData = createInitData({
      auth_date: '1778490000',
      user: JSON.stringify({ first_name: 'Pavel' }),
    });

    expect(() =>
      validateTelegramInitData({
        initData,
        botToken: BOT_TOKEN,
        now: NOW,
      }),
    ).toThrow('user.id is required');
  });
});
