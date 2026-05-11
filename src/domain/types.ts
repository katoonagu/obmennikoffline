export type Network = 'TRON';
export type Asset = 'USDT';
export type OrderDirection = 'BUY_USDT' | 'SELL_USDT';

export type DepositAddressStatus =
  | 'available'
  | 'reserved'
  | 'funded'
  | 'expired'
  | 'late_funded'
  | 'disabled';

export type OrderStatus =
  | 'draft'
  | 'awaiting_deposit'
  | 'awaiting_office_visit'
  | 'funds_detected'
  | 'pending_aml'
  | 'manager_review'
  | 'ready_for_cash_payout'
  | 'ready_for_crypto_payout'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'late_payment'
  | 'rejected';

export type MoneyString = string;
