import type { OrderStatus } from '../domain/types.js';
import type { OrderDto } from '../orders/orderReadService.js';
import {
  parseAddressPoolCsv,
  type AddressPoolCsvRow,
} from '../wallet/addressPoolCsv.js';

export const MANAGER_STATUS_OPTIONS = [
  'pending_aml',
  'manager_review',
  'ready_for_cash_payout',
  'ready_for_crypto_payout',
  'completed',
  'cancelled',
  'expired',
  'rejected',
] as const satisfies readonly OrderStatus[];

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Черновик',
  awaiting_deposit: 'Ожидает депозит',
  awaiting_office_visit: 'Ожидает визит',
  funds_detected: 'Средства найдены',
  pending_aml: 'AML-проверка',
  manager_review: 'Проверка менеджером',
  ready_for_cash_payout: 'Готово к выплате RUB',
  ready_for_crypto_payout: 'Готово к выплате USDT',
  completed: 'Завершена',
  cancelled: 'Отменена',
  expired: 'Истекла',
  late_payment: 'Поздний платеж',
  rejected: 'Отклонена',
};

export function formatAdminOrderDirection(order: OrderDto): string {
  return order.direction === 'BUY_USDT' ? 'Покупка USDT' : 'Продажа USDT';
}

export function formatAdminOrderStatus(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function formatAdminOrderAmount(order: OrderDto): string {
  if (order.direction === 'BUY_USDT') {
    return `${formatRub(order.amountRub)} ₽ -> ${formatUsdt(order.amountUsdt)} USDT`;
  }

  return `${formatUsdt(order.amountUsdt)} USDT -> ${formatRub(order.amountRub)} ₽`;
}

export function formatAdminCustomer(order: OrderDto): string {
  return `${order.customer.lastName} ${order.customer.firstName} ${order.customer.middleName}`;
}

export function canRecordManualCryptoPayout(order: OrderDto): boolean {
  return (
    order.direction === 'BUY_USDT' &&
    order.clientPayoutAddress !== null &&
    order.cryptoPayout === null &&
    (
      order.status === 'awaiting_office_visit' ||
      order.status === 'ready_for_crypto_payout' ||
      order.status === 'manager_review'
    )
  );
}

export function parseAddressPoolCsvForAdmin(csv: string): AddressPoolCsvRow[] {
  return parseAddressPoolCsv(csv);
}

function formatUsdt(value: string | null): string {
  if (!value) return '0.00';
  const [integer, fraction = ''] = value.split('.');
  return `${groupDigits(integer)}.${fraction.slice(0, 2).padEnd(2, '0')}`;
}

function formatRub(value: string | null): string {
  if (!value) return '0';
  const [integer, fraction = ''] = value.split('.');
  const grouped = groupDigits(integer);

  return fraction.replace(/0+$/, '')
    ? `${grouped},${fraction.replace(/0+$/, '')}`
    : grouped;
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
