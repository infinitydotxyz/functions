import { BigNumberish, ethers } from 'ethers';

import { getCallTrace } from '@georgeroman/evm-tx-simulator';

import { bn } from '@/lib/utils';

export class GasSimulator {
  public get simulationAccount() {
    return this._simulationAccount;
  }
  constructor(protected _provider: ethers.providers.StaticJsonRpcProvider, protected _simulationAccount: string) {}

  async simulate(txnData: { to: string; data: string; value?: BigNumberish; from: string }) {
    const value = bn(txnData.value ?? '0');
    try {
      const estimate = await this._provider.estimateGas({
        from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik - has lots of ETH
        to: txnData.to,
        value,
        data: txnData.data
      });

      return estimate.toString();
    } catch (err) {
      console.warn(`Failed to estimate gas for txn: ${JSON.stringify(txnData)}. Attempting to use a call trace`, err);
    }

    const result = await getCallTrace(
      {
        ...txnData,
        gas: 10_000_000,
        gasPrice: 0,
        value,
        balanceOverrides: {
          [txnData.from]: value
        }
      },
      this._provider
    );
    const gasUsed = bn((result as any).gasUsed);

    return gasUsed.toString();
  }
}
