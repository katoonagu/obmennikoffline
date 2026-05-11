import { describe, expect, it, vi } from 'vitest';
import {
  resolveTelegramUserInDb,
  type TelegramUserDb,
} from '../../src/users/telegramUserService.js';

describe('resolveTelegramUserInDb', () => {
  it('upserts Telegram profiles and creates a local user when missing', async () => {
    const upsert = vi.fn().mockResolvedValue({
      userId: 'user-1',
      telegramUserId: 462656683n,
    });
    const db: TelegramUserDb = {
      telegramProfile: { upsert },
    };

    await expect(
      resolveTelegramUserInDb({
        db,
        telegramUser: {
          id: 462656683,
          first_name: 'Pavel',
          last_name: 'Astrahanov',
          username: 'pavel',
        },
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      telegramUserId: 462656683n,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        telegramUserId: 462656683n,
      },
      update: {
        username: 'pavel',
        firstName: 'Pavel',
        lastName: 'Astrahanov',
      },
      create: {
        telegramUserId: 462656683n,
        username: 'pavel',
        firstName: 'Pavel',
        lastName: 'Astrahanov',
        user: {
          create: {},
        },
      },
      select: {
        userId: true,
        telegramUserId: true,
      },
    });
  });

  it('rejects initData without a Telegram user', async () => {
    const db: TelegramUserDb = {
      telegramProfile: { upsert: vi.fn() },
    };

    await expect(
      resolveTelegramUserInDb({
        db,
        telegramUser: null,
      }),
    ).rejects.toThrow('telegram user is required');

    expect(db.telegramProfile.upsert).not.toHaveBeenCalled();
  });
});
