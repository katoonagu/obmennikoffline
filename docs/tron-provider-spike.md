# TRON Provider Spike

## Goal

Select the first TRON data provider for MVP watcher implementation.

## Required Behavior

The provider must reliably detect incoming USDT TRC20 transfers to a newly generated, not pre-activated TRON address.

## Providers To Test

- TronGrid
- Tatum
- QuickNode
- GetBlock

## Test Matrix

| Provider | Can query tx by tx id | Can query USDT transfers by destination address | Sees inactive-address deposit | Event delay seconds | Free/paid plan | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TronGrid | unknown | unknown | unknown | unknown | unknown | empty |
| Tatum | unknown | unknown | unknown | unknown | unknown | empty |
| QuickNode | unknown | unknown | unknown | unknown | unknown | empty |
| GetBlock | unknown | unknown | unknown | unknown | unknown | empty |

## Procedure

1. Generate one new TRON address from the offline HD wallet test seed.
2. Do not pre-activate it.
3. Send a small mainnet USDT TRC20 amount from a disposable wallet.
4. Record tx hash.
5. Query each provider by tx hash.
6. Query each provider by destination address.
7. Record delay until event appears.
8. Pick the provider that can detect destination-address transfers reliably with acceptable delay and cost.

## Decision Rule

Choose the cheapest provider that satisfies all required behavior. If multiple providers pass, prefer the one with clearer TRC20 transfer APIs and better rate limits. Keep one fallback provider in config for manual retry.

## Safety Notes

- Do not use production treasury wallets during the spike.
- Do not store provider API keys in committed files.
- Do not treat provider pricing or limits as fixed until checked on the provider site during the spike.
