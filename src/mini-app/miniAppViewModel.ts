import type { OrderDto, UserProfileDto } from '../orders/orderReadService.js';
import type { UsdtRubRates } from '../rates/rateQuoteService.js';
import type { MiniAppTone } from './miniAppContent.js';

export interface MiniAppOrderCardViewModel {
  publicId: string;
  title: string;
  statusLabel: string;
  statusTone: MiniAppTone;
  createdAtLabel: string;
}

export interface MiniAppHomeViewModel {
  rates: {
    buy: string;
    sell: string;
  };
  activeOrders: MiniAppOrderCardViewModel[];
}

export interface MiniAppDetailRowViewModel {
  label: string;
  value: string;
  tone?: MiniAppTone;
  copyable?: boolean;
}

export interface MiniAppOrderDetailViewModel {
  title: string;
  publicId: string;
  statusLabel: string;
  statusTone: MiniAppTone;
  qrValue: string | null;
  rows: MiniAppDetailRowViewModel[];
  primaryAmountLabel: string;
  directionLabel: string;
}

export interface MiniAppProfileViewModel {
  telegramIdLabel: string;
  usernameLabel: string;
  totalOrdersLabel: string;
  activeOrdersLabel: string;
}

const MOSCOW_TIME_ZONE = 'Europe/Moscow';
const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

export function createMiniAppHomeViewModel(input: {
  rates: UsdtRubRates;
  activeOrders: readonly OrderDto[];
}): MiniAppHomeViewModel {
  return {
    rates: {
      buy: `${formatDecimal(input.rates.buyRate, 2)} ₽`,
      sell: `${formatDecimal(input.rates.sellRate, 2)} ₽`,
    },
    activeOrders: input.activeOrders.map(createOrderCardViewModel),
  };
}

export function createMiniAppOrderDetailViewModel(
  order: OrderDto,
): MiniAppOrderDetailViewModel {
  const rows: MiniAppDetailRowViewModel[] = [
    {
      label: 'ID заявки',
      value: order.publicId,
      tone: 'mono',
      copyable: true,
    },
    {
      label: order.direction === 'SELL_USDT' ? 'Сумма в USDT' : 'Сумма в рублях',
      value: order.direction === 'SELL_USDT'
        ? `${formatDecimal(order.amountUsdt ?? '0', 2)} USDT`
        : `${formatRub(order.amountRub ?? '0.00')} ₽`,
      tone: 'mono',
    },
    {
      label: 'Курс',
      value: `${formatDecimal(order.rateSnapshot, 2)} ₽`,
      tone: 'mono',
    },
  ];

  if (order.depositAddress) {
    rows.push({
      label: 'Адрес для перевода (TRC-20)',
      value: order.depositAddress,
      tone: 'mono',
      copyable: true,
    });
  }

  if (order.clientPayoutAddress) {
    rows.push({
      label: 'Кошелек для получения (TRC-20)',
      value: order.clientPayoutAddress,
      tone: 'mono',
      copyable: true,
    });
  }

  rows.push(
    {
      label: 'Сеть',
      value: 'Tron (TRC-20)',
    },
    {
      label: 'Дата создания',
      value: formatMoscowDateTime(order.createdAt),
      tone: 'mono',
    },
  );

  return {
    title: 'Детали заявки',
    publicId: order.publicId,
    statusLabel: formatOrderStatus(order.status).label,
    statusTone: formatOrderStatus(order.status).tone,
    qrValue: order.depositAddress,
    rows,
    primaryAmountLabel: getOrderPrimaryAmount(order),
    directionLabel: order.direction === 'SELL_USDT' ? 'Продажа USDT' : 'Покупка USDT',
  };
}

export function createMiniAppProfileViewModel(
  profile: UserProfileDto,
): MiniAppProfileViewModel {
  return {
    telegramIdLabel: profile.telegram
      ? maskTelegramId(profile.telegram.telegramUserId)
      : 'Не привязан',
    usernameLabel: profile.telegram?.username
      ? `@${profile.telegram.username}`
      : 'Без username',
    totalOrdersLabel: profile.stats.totalOrders.toString(),
    activeOrdersLabel: profile.stats.activeOrders.toString(),
  };
}

function createOrderCardViewModel(order: OrderDto): MiniAppOrderCardViewModel {
  const status = formatOrderStatus(order.status);

  return {
    publicId: order.publicId,
    title: getOrderCardTitle(order),
    statusLabel: status.label,
    statusTone: status.tone,
    createdAtLabel: formatMoscowDateTime(order.createdAt),
  };
}

function getOrderCardTitle(order: OrderDto): string {
  if (order.direction === 'SELL_USDT') {
    return `Продажа ${formatDecimal(order.amountUsdt ?? '0', 2)} USDT`;
  }

  return `Покупка на ${formatRub(order.amountRub ?? '0.00')} ₽`;
}

function getOrderPrimaryAmount(order: OrderDto): string {
  return order.direction === 'SELL_USDT'
    ? `${formatDecimal(order.amountUsdt ?? '0', 2)} USDT`
    : `${formatRub(order.amountRub ?? '0.00')} ₽`;
}

function formatOrderStatus(status: OrderDto['status']): {
  label: string;
  tone: MiniAppTone;
} {
  switch (status) {
    case 'awaiting_deposit':
    case 'awaiting_office_visit':
      return { label: 'В ожидании', tone: 'warning' };
    case 'funds_detected':
      return { label: 'Средства получены', tone: 'accent' };
    case 'pending_aml':
      return { label: 'AML проверка', tone: 'warning' };
    case 'manager_review':
      return { label: 'Проверка менеджером', tone: 'warning' };
    case 'ready_for_cash_payout':
      return { label: 'Готово к выплате RUB', tone: 'accent' };
    case 'ready_for_crypto_payout':
      return { label: 'Готово к отправке USDT', tone: 'accent' };
    case 'completed':
      return { label: 'Завершена', tone: 'accent' };
    case 'late_payment':
      return { label: 'Поздний перевод', tone: 'warning' };
    case 'cancelled':
    case 'expired':
    case 'rejected':
      return { label: 'Закрыта', tone: 'default' };
    case 'draft':
      return { label: 'Черновик', tone: 'default' };
  }
}

function formatDecimal(value: string, fractionDigits: number): string {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const formattedInteger = formatInteger(integerPart);
  const normalizedFraction = fractionalPart.padEnd(fractionDigits, '0').slice(0, fractionDigits);

  return fractionDigits > 0
    ? `${formattedInteger}.${normalizedFraction}`
    : formattedInteger;
}

function formatRub(value: string): string {
  const [integerPart] = value.split('.');
  return formatInteger(integerPart);
}

function formatInteger(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatMoscowDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW_TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const monthIndex = Number(part('month')) - 1;

  return `${Number(part('day'))} ${MONTHS_RU[monthIndex]} ${part('year')}, ${part('hour')}:${part('minute')}`;
}

function maskTelegramId(telegramUserId: string): string {
  return `••••••${telegramUserId.slice(-2)}`;
}
