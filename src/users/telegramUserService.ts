import type { TelegramInitDataUser } from '../telegram/validateInitData.js';

export interface ResolvedTelegramUser {
  userId: string;
  telegramUserId: bigint;
}

export interface TelegramUserDb {
  telegramProfile: {
    upsert(input: {
      where: {
        telegramUserId: bigint;
      };
      update: {
        username?: string;
        firstName?: string;
        lastName?: string;
      };
      create: {
        telegramUserId: bigint;
        username?: string;
        firstName?: string;
        lastName?: string;
        user: {
          create: Record<string, never>;
        };
      };
      select: {
        userId: true;
        telegramUserId: true;
      };
    }): Promise<ResolvedTelegramUser>;
  };
}

export async function resolveTelegramUserInDb(input: {
  db: TelegramUserDb;
  telegramUser: TelegramInitDataUser | null;
}): Promise<ResolvedTelegramUser> {
  if (!input.telegramUser) {
    throw new Error('telegram user is required');
  }

  const telegramUserId = BigInt(input.telegramUser.id);
  const profile = toProfileFields(input.telegramUser);

  return input.db.telegramProfile.upsert({
    where: {
      telegramUserId,
    },
    update: profile,
    create: {
      telegramUserId,
      ...profile,
      user: {
        create: {},
      },
    },
    select: {
      userId: true,
      telegramUserId: true,
    },
  });
}

function toProfileFields(user: TelegramInitDataUser): {
  username?: string;
  firstName?: string;
  lastName?: string;
} {
  return {
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  };
}
