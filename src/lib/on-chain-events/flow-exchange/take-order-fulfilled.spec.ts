import { Contract } from 'ethers';

import { FlowExchangeABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';
import { getExchangeAddress } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { getProvider } from '@/lib/utils/ethersUtils';

import { TakeOrderFulfilledEvent } from './take-order-fulfilled';

jest.setTimeout(60_000);

class PublicTakeOrderFulfilledEvent extends TakeOrderFulfilledEvent {
  public getOrderNonceFromTrace(orderHash: string, params: { txHash: string }) {
    return super.getOrderNonceFromTrace(orderHash, params);
  }
}

describe('TakeOrderFulfilled', () => {
  it('should decode takeMultipleOneOrders', async () => {
    const txHash = '0xc7bf0a5bb4338ff4dbfd2c7bb64829f14daa39079abe3d4d246b202881d1f6c7';
    const chainId = ChainId.Mainnet;
    const orderHash = '0xf538af4135ca6d55f836184bca86a1376257253326b6a9cd8116666b12e65829';

    const provider = getProvider(chainId);
    const exchangeAddress = getExchangeAddress(chainId);

    const contract = new Contract(exchangeAddress, FlowExchangeABI, provider);

    const eventHandler = new PublicTakeOrderFulfilledEvent(chainId, contract, exchangeAddress, getDb());

    const { nonce } = await eventHandler.getOrderNonceFromTrace(orderHash, { txHash });
    expect(nonce).not.toBeNull();
  });
});
