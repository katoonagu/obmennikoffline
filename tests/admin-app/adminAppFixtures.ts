import type { OrderDto } from '../../src/orders/orderReadService.js';

export const sampleAdminOrder = {
  publicId: 'E74737',
  direction: 'SELL_USDT',
  asset: 'USDT',
  network: 'TRON',
  customer: {
    lastName: 'Alekseev',
    firstName: 'Pavel',
    middleName: 'Astrakhanov',
  },
  amountUsdt: '5000.000000',
  amountRub: '381250.00',
  rateSnapshot: '76.250000',
  rateExpiresAt: '2026-05-11T09:20:00.000Z',
  orderExpiresAt: '2026-05-11T10:00:00.000Z',
  status: 'awaiting_deposit',
  depositAddress: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
  clientPayoutAddress: null,
  cryptoPayout: null,
  createdAt: '2026-05-11T09:00:00.000Z',
  updatedAt: '2026-05-11T09:00:00.000Z',
  completedAt: null,
} satisfies OrderDto;
