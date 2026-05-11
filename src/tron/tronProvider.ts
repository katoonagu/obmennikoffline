export const USDT_TRC20_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export interface TronTransferEvent {
  txId: string;
  logIndex: number;
  contractAddress: string;
  fromAddress: string;
  toAddress: string;
  amountRaw: string;
  decimals: number;
  blockNumber: bigint;
  blockTimestamp: Date;
}

export interface TronProvider {
  getUsdtTransfersToAddresses(input: {
    addresses: string[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<TronTransferEvent[]>;
}
