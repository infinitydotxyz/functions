import { BigNumber, BigNumberish } from 'ethers';
import { Interface } from 'ethers/lib/utils';

import { ChainId } from '@infinityxyz/lib/types/core';

import * as Flow from '../../flow';

export type ArrayifiedFlowOrder = [
  boolean,
  string,
  BigNumberish[],
  [string, [BigNumberish, BigNumberish][]][],
  [string, string],
  string,
  string
];
export const decodeArrayifiedOrder = (chainId: ChainId, item: ArrayifiedFlowOrder): Flow.Order => {
  const [isSellOrder, signer, constraints, arrayifiedNfts, [complication, currency], extraParams, sig] = item;

  const nfts: Flow.Types.OrderNFTs[] = arrayifiedNfts.map(
    ([collection, arrayifiedTokens]: [string, [BigNumberish, BigNumberish][]]) => {
      return {
        collection: collection.toLowerCase(),
        tokens: arrayifiedTokens.map(([tokenId, numTokens]: [BigNumberish, BigNumberish]) => {
          return {
            tokenId: BigNumber.from(tokenId).toString(),
            numTokens: BigNumber.from(numTokens).toNumber()
          };
        })
      };
    }
  );

  const params: Flow.Types.InternalOrder = {
    isSellOrder,
    signer: signer.toLowerCase(),
    constraints: constraints.map((item) => BigNumber.from(item).toString()),
    nfts,
    execParams: [complication, currency].map((x) => x.toLowerCase()),
    extraParams
  };

  return new Flow.Order(parseInt(chainId, 10), params);
};

export const FlowFulfillOrderMethods = {
  matchOneToManyOrders: {
    methodId: '0x63f3c034',
    decodeInput: (input: string, iface: Interface, chainId: ChainId): Flow.Order[] => {
      const [makerOrder, manyMakerOrders] = iface.decodeFunctionData('matchOneToManyOrders', input);
      return [makerOrder, ...manyMakerOrders].map((item) => decodeArrayifiedOrder(chainId, item));
    }
  },
  matchOneToOneOrders: {
    methodId: '0x9d9a0cef',
    decodeInput: (input: string, iface: Interface, chainId: ChainId): Flow.Order[] => {
      const [makerOrders1, makerOrders2] = iface.decodeFunctionData('matchOneToOneOrders', input);
      return [...makerOrders1, ...makerOrders2].map((item) => decodeArrayifiedOrder(chainId, item));
    }
  },
  matchOrders: {
    methodId: '0x0df4239c',
    decodeInput: (input: string, iface: Interface, chainId: ChainId): Flow.Order[] => {
      const [sells, buys] = iface.decodeFunctionData('matchOrders', input);
      return [...sells, ...buys].map((item) => decodeArrayifiedOrder(chainId, item));
    }
  },
  takeMultipleOneOrders: {
    methodId: '0x78759e13',
    decodeInput: (input: string, iface: Interface, chainId: ChainId): Flow.Order[] => {
      const [makerOrders] = iface.decodeFunctionData('takeMultipleOneOrders', input);
      return makerOrders.map((item: ArrayifiedFlowOrder) => decodeArrayifiedOrder(chainId, item));
    }
  },
  takeOrders: {
    methodId: '0x723d9836',
    decodeInput: (input: string, iface: Interface, chainId: ChainId): Flow.Order[] => {
      const [makerOrders] = iface.decodeFunctionData('takeOrders', input);
      return makerOrders.map((item: ArrayifiedFlowOrder) => decodeArrayifiedOrder(chainId, item));
    }
  }
};
