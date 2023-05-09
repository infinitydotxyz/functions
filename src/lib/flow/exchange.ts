import { TypedDataDomain, constants } from 'ethers';
import { _TypedDataEncoder, defaultAbiCoder, hexConcat, keccak256 } from 'ethers/lib/utils';
import MerkleTree from 'merkletreejs';

import { Signer, TypedDataSigner } from '@ethersproject/abstract-signer';
import { Contract, ContractTransaction } from '@ethersproject/contracts';
import { Common } from '@reservoir0x/sdk';

import ExchangeAbi from './abis/Exchange.json';
import * as Addresses from './addresses';
import { getComplication } from './complications';
import { Complication } from './complications/complication.interface';
import { Order } from './order';
import * as Types from './types';
import { TxData, bn, lc } from './utils';

const CommonAddresses = Common.Addresses;

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Take Orders ---

  public async takeOrders(taker: Signer, orders: Types.TakeOrderParams): Promise<ContractTransaction>;
  public async takeOrders(taker: Signer, orders: Types.TakeOrderParams[]): Promise<ContractTransaction>;
  public async takeOrders(
    taker: Signer,
    orders: Types.TakeOrderParams | Types.TakeOrderParams[]
  ): Promise<ContractTransaction> {
    const takerAddress = lc(await taker.getAddress());
    if (!Array.isArray(orders)) {
      orders = [orders];
    }
    const tx = this.takeOrdersTx(takerAddress, orders);
    return taker.sendTransaction(tx);
  }

  public takeOrdersTx(taker: string, orders: Types.TakeOrderParams[]): TxData {
    this.checkOrders(
      taker,
      orders.map((item) => item.order)
    );

    const orderData = [orders.map((item) => item.order.getSignedOrder()), orders.map((item) => item.tokens)];

    const commonTxData = {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData('takeOrders', orderData)
    };

    if (orders[0].order.currency === CommonAddresses.Eth[this.chainId]) {
      const value = orders.reduce((acc, { order }) => {
        return acc.add(order.getMatchingPrice());
      }, bn(0));

      return {
        ...commonTxData,
        value: value.toHexString()
      };
    }
    return commonTxData;
  }

  // --- Take Multiple One Orders ---
  public async takeMultipleOneOrders(taker: Signer, order: Order): Promise<ContractTransaction>;
  public async takeMultipleOneOrders(taker: Signer, orders: Order[]): Promise<ContractTransaction>;
  public async takeMultipleOneOrders(taker: Signer, orders: Order | Order[]): Promise<ContractTransaction> {
    const takerAddress = lc(await taker.getAddress());
    if (!Array.isArray(orders)) {
      orders = [orders];
    }
    const tx = this.takeMultipleOneOrdersTx(takerAddress, orders);
    return taker.sendTransaction(tx);
  }

  public takeMultipleOneOrdersTx(taker: string, orders: Order[]): TxData {
    this.checkOrders(taker, orders);

    const commonTxData = {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData('takeMultipleOneOrders', [
        orders.map((item) => item.getSignedOrder())
      ])
    };

    if (orders[0].currency === CommonAddresses.Eth[this.chainId]) {
      const value = orders.reduce((acc, order) => {
        return acc.add(order.getMatchingPrice());
      }, bn(0));

      return {
        ...commonTxData,
        value: value.toHexString()
      };
    }
    return commonTxData;
  }

  // --- Cancel Multiple Orders ---

  public async cancelMultipleOrders(signer: Signer, orderNonce: string): Promise<ContractTransaction>;
  public async cancelMultipleOrders(signer: Signer, orderNonces: string[]): Promise<ContractTransaction>;
  public async cancelMultipleOrders(signer: Signer, orderNonces: string | string[]): Promise<ContractTransaction> {
    if (!Array.isArray(orderNonces)) {
      orderNonces = [orderNonces];
    }
    const signerAddress = lc(await signer.getAddress());
    const tx = this.cancelMultipleOrdersTx(signerAddress, orderNonces);
    return signer.sendTransaction(tx);
  }

  public cancelMultipleOrdersTx(signer: string, orderNonces: string[]): TxData {
    return {
      from: signer,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData('cancelMultipleOrders', [orderNonces])
    };
  }

  // --- Cancel All Orders ---

  public async cancelAllOrders(signer: Signer, minNonce: string): Promise<ContractTransaction> {
    const signerAddress = lc(await signer.getAddress());
    const tx = this.cancelAllOrdersTx(signerAddress, minNonce);
    return signer.sendTransaction(tx);
  }

  public cancelAllOrdersTx(signer: string, minNonce: string): TxData {
    return {
      from: signer,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData('cancelAllOrders', [minNonce])
    };
  }

  protected checkOrders(taker: string, orders: Order[]) {
    const sameSide = orders.every((order) => order.isSellOrder === orders[0].isSellOrder);
    if (!sameSide) {
      throw new Error('All orders must be of the same side');
    }

    const sameCurrency = orders.every((order) => order.currency === orders[0].currency);
    if (!sameCurrency) {
      throw new Error('All orders must be of the same currency');
    }

    const differentAccounts = orders.every((order) => order.signer !== taker);
    if (!differentAccounts) {
      throw new Error('No dogfooding');
    }
  }

  // --- Bulk sign orders ---

  public async bulkSign(signer: TypedDataSigner, orders: Order[]) {
    const { signatureData, proofs } = this.getBulkSignatureDataWithProofs(orders);

    const signature = await signer._signTypedData(signatureData.domain, signatureData.types, signatureData.value);

    let index = 0;
    for (const order of orders) {
      index += 1;
      await order.setSig(this.encodeBulkOrderProofAndSignature(index, proofs[index], signature));
    }
  }

  public encodeBulkOrderProofAndSignature = (orderIndex: number, merkleProof: string[], signature: string) => {
    return hexConcat([
      signature,
      `0x${orderIndex.toString(16).padStart(6, '0')}`,
      defaultAbiCoder.encode([`uint256[${merkleProof.length}]`], [merkleProof])
    ]);
  };

  public getBulkSignatureDataWithProofs(orders: Order[]) {
    const height = Math.max(Math.ceil(Math.log2(orders.length)), 1);
    const size = Math.pow(2, height);

    let complicationInstance: Complication | undefined;
    let firstOrderSignatureData: Types.SignatureData | undefined;

    const checkDomains = (domain1: TypedDataDomain, domain2: TypedDataDomain) => {
      const chainIdMatches = domain1.chainId === domain2.chainId;
      const verifyingContractMatches = domain1.verifyingContract === domain2.verifyingContract;
      const nameMatches = domain1.name === domain2.name;
      const versionMatches = domain1.version === domain2.version;
      return chainIdMatches && verifyingContractMatches && nameMatches && versionMatches;
    };
    for (const order of orders) {
      if (!order.supportsBulkSignatures) {
        throw new Error('Order does not support bulk signatures');
      }

      if (!firstOrderSignatureData) {
        firstOrderSignatureData = order.getSignatureData();
      }

      const orderComplicationInstance = getComplication(order.chainId, order.complication);
      if (!complicationInstance) {
        complicationInstance = orderComplicationInstance;
      } else {
        checkDomains(complicationInstance.domain, orderComplicationInstance.domain);
      }
    }

    if (!firstOrderSignatureData || !complicationInstance) {
      throw new Error('No orders provided');
    }

    const types = firstOrderSignatureData.types;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (types as any).BulkOrder = [{ name: 'tree', type: `Order${`[2]`.repeat(height)}` }];
    const encoder = _TypedDataEncoder.from(types);

    const hashElement = (element: Types.InternalOrder) => encoder.hashStruct('Order', element);

    const elements: Types.InternalOrder[] = orders.map((o) => {
      return o.getInternalOrder(o);
    });
    const leaves = elements.map((e) => hashElement(e));

    const defaultElement: Types.InternalOrder = {
      isSellOrder: false,
      signer: constants.AddressZero,
      constraints: [],
      nfts: [],
      execParams: [],
      extraParams: constants.HashZero
    };
    const defaultLeaf = hashElement(defaultElement);

    // Ensure the tree is complete
    while (elements.length < size) {
      elements.push(defaultElement);
      leaves.push(defaultLeaf);
    }

    const hexToBuffer = (value: string) => Buffer.from(value.slice(2), 'hex');
    const bufferKeccak = (value: string) => hexToBuffer(keccak256(value));

    const tree = new MerkleTree(leaves.map(hexToBuffer), bufferKeccak, {
      complete: true,
      sort: false,
      hashLeaves: false,
      fillDefaultHash: hexToBuffer(defaultLeaf)
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chunks: any[] = [...elements];
    while (chunks.length > 2) {
      const newSize = Math.ceil(chunks.length / 2);
      chunks = Array(newSize)
        .fill(0)
        .map((_, i) => chunks.slice(i * 2, (i + 1) * 2));
    }

    return {
      signatureData: {
        signatureKind: 'eip712',
        domain: complicationInstance.domain,
        types,
        value: { tree: chunks },
        primaryType: _TypedDataEncoder.getPrimaryType(types)
      },
      proofs: orders.map((_, i) => tree.getHexProof(leaves[i], i))
    };
  }
}
