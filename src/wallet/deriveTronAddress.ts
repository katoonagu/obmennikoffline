import { validateMnemonic } from 'bip39';
import { HDNodeWallet } from 'ethers';
import { utils as tronUtils } from 'tronweb';

const MAX_NON_HARDENED_BIP32_INDEX = 0x80000000 - 1;

export interface DerivedTronAddress {
  index: number;
  derivationPath: string;
  address: string;
}

export interface DeriveTronAddressInput {
  mnemonic: string;
  index: number;
}

export function tronDerivationPath(index: number): string {
  assertSafeIndex(index);
  return `m/44'/195'/0'/0/${index}`;
}

export function deriveTronAddress(input: DeriveTronAddressInput): DerivedTronAddress {
  const derivationPath = tronDerivationPath(input.index);

  if (!validateMnemonic(input.mnemonic)) {
    throw new Error('TRON_MNEMONIC must be a valid BIP39 mnemonic');
  }

  const wallet = HDNodeWallet.fromPhrase(input.mnemonic, undefined, derivationPath);
  const privateKey = wallet.privateKey.startsWith('0x')
    ? wallet.privateKey.slice(2)
    : wallet.privateKey;
  const address = tronUtils.address.fromPrivateKey(privateKey);

  if (!address) {
    throw new Error(`failed to derive TRON address at index ${input.index}`);
  }

  return {
    index: input.index,
    derivationPath,
    address,
  };
}

function assertSafeIndex(index: number): void {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > MAX_NON_HARDENED_BIP32_INDEX
  ) {
    throw new Error('index must be a safe non-negative integer');
  }
}
