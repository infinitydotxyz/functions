import { Contract } from 'ethers';

import { FlowExchangeABI } from '@infinityxyz/lib/abi/flowExchange';
import { ChainId } from '@infinityxyz/lib/types/core';
import { getExchangeAddress } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { getProvider } from '@/lib/utils/ethersUtils';

import { MatchOrderFulfilledEvent } from './match-order-fulfilled';

jest.setTimeout(60_000);
describe('MatchOrderFulfilled', () => {
  it('should decode the event', async () => {
    const chainId = ChainId.Goerli;
    const address = getExchangeAddress(chainId);
    const provider = getProvider(chainId);
    const contract = new Contract(address, FlowExchangeABI, provider);

    const eventHandler = new MatchOrderFulfilledEvent(chainId, contract, contract.address, getDb());
    const txHash = '0x458fac0df8087d29427db4e7a64c7c8015f034701a3ca561ded33a4a204f92c2';
    const receipt = await provider.getTransactionReceipt(txHash);
    let numLogs = 0;
    for (const log of receipt.logs) {
      const baseParams = {
        chainId,
        address,
        txHash,
        block: receipt.blockNumber,
        logIndex: log.logIndex,
        batchIndex: 1,
        txIndex: receipt.transactionIndex,
        blockHash: receipt.blockHash
      };
      if (eventHandler.matches(log, baseParams)) {
        const result = await eventHandler.transformEvent({
          log,
          baseParams
        });

        numLogs += 1;
      }
    }

    expect(numLogs).toBe(1);
  });
  it('test', async () => {
    const chainId = ChainId.Goerli;
    const address = getExchangeAddress(chainId);
    const provider = getProvider(chainId);
    const contract = new Contract(address, FlowExchangeABI, provider);

    const eventHandler = new MatchOrderFulfilledEvent(chainId, contract, contract.address, getDb());
    const orderHash = '0xc01f044e56e1bafd790dbfd1227414a2d83cf62c0914767ef3a8e5af39ef5cc5';
    const txHash = '0x66926260da6090427b8bc5caa495f145b5570e0e78e9dbbe0433d4825e2df8e0';
    const result = await eventHandler.getOrderNonceFromTrace(orderHash, { txHash });

    console.log(`Result: ${JSON.stringify(result, null, 2)}`);

    expect(result).not.toBeNull();
  });
});
