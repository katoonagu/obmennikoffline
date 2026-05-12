import { describe, expect, it } from 'vitest';
import {
  canRecordManualCryptoPayout,
  formatAdminOrderAmount,
  formatAdminOrderDirection,
  formatAdminOrderStatus,
  parseAddressPoolCsvForAdmin,
} from '../../src/admin-app/adminAppViewModel.js';
import { sampleAdminOrder } from './adminAppFixtures.js';

describe('Admin App view model', () => {
  it('formats order queue rows with manager-readable Russian labels', () => {
    expect(formatAdminOrderDirection(sampleAdminOrder)).toBe('Продажа USDT');
    expect(formatAdminOrderStatus('awaiting_deposit')).toBe('Ожидает депозит');
    expect(formatAdminOrderAmount(sampleAdminOrder)).toBe('5 000.00 USDT -> 381 250 ₽');
  });

  it('only enables manual crypto payout recording for BUY orders that have a client wallet', () => {
    expect(canRecordManualCryptoPayout(sampleAdminOrder)).toBe(false);
    expect(canRecordManualCryptoPayout({
      ...sampleAdminOrder,
      direction: 'BUY_USDT',
      status: 'ready_for_crypto_payout',
      depositAddress: null,
      clientPayoutAddress: 'TTDAU9ovqbKPqVVy2TeZ4pKCrLRh6rR5R7',
    })).toBe(true);
  });

  it('parses public address pool CSV rows for the import screen', () => {
    expect(parseAddressPoolCsvForAdmin(
      'network,asset,derivation_index,address\nTRON,USDT,42,TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY\n',
    )).toEqual([
      {
        network: 'TRON',
        asset: 'USDT',
        derivationIndex: 42,
        address: 'TXndknnAM2awhzH6p9AidYVKPtUzXmWmkY',
      },
    ]);
  });
});
